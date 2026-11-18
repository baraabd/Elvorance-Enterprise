import type {
  CatalogDirectory,
  CatalogSnapshot,
  CustomerContext,
  CustomerDirectory,
} from '@elvorance/contracts';
import { AppError, assert } from './errors.ts';
import { array, object, text, integer } from './validation.ts';

/** A bounded service-to-service HTTP adapter. Caller identity is preserved at CRM. */
export class HttpCustomerDirectory implements CustomerDirectory, CatalogDirectory {
  private readonly origin: string;
  constructor(origin: string) {
    const url = new URL(origin);
    assert(
      ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash,
      'CONFIGURATION',
      'CRM_URL must be an HTTP origin without credentials, path or query',
      500,
    );
    this.origin = url.origin;
  }
  async getCustomer(id: string, authorization: string): Promise<CustomerContext> {
    let response: Response;
    try {
      response = await fetch(`${this.origin}/v1/customers/${encodeURIComponent(id)}/context`, {
        headers: { authorization },
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
    } catch {
      throw new AppError(
        503,
        'CRM_UNAVAILABLE',
        'Customer ownership could not be verified; retry later',
      );
    }
    if (!response.ok)
      throw new AppError(
        response.status < 500 ? response.status : 503,
        'CUSTOMER_SCOPE',
        response.status < 500
          ? 'Customer is not accessible to this account'
          : 'Customer service is temporarily unavailable',
      );
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new AppError(502, 'INVALID_CRM_RESPONSE', 'Customer service response is invalid');
    }
    const value = object(raw);
    assert(
      typeof value.doNotContact === 'boolean',
      'INVALID_CRM_RESPONSE',
      'Customer service response is invalid',
      502,
    );
    return {
      id: text(value.id, 'id', 1, 100),
      name: text(value.name, 'name', 2, 200),
      repId: text(value.repId, 'repId', 1, 100),
      regionId: value.regionId ? text(value.regionId, 'regionId', 1, 100) : null,
      doNotContact: value.doNotContact,
      consentVersion: integer(value.consentVersion, 'consentVersion', 1),
      version: integer(value.version, 'version', 1),
    };
  }
  async getCatalog(authorization: string): Promise<CatalogSnapshot> {
    let response: Response;
    try {
      response = await fetch(`${this.origin}/v1/catalog`, {
        headers: { authorization },
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
    } catch {
      throw new AppError(503, 'CRM_UNAVAILABLE', 'Published service pricing could not be verified');
    }
    if (!response.ok)
      throw new AppError(
        response.status < 500 ? response.status : 503,
        'CATALOG_UNAVAILABLE',
        'Published service pricing is not accessible',
      );
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new AppError(502, 'INVALID_CRM_RESPONSE', 'Catalog response is invalid');
    }
    const value = object(raw);
    assert(
      typeof value.configured === 'boolean',
      'INVALID_CRM_RESPONSE',
      'Catalog response is invalid',
      502,
    );
    return {
      configured: value.configured,
      recordVersion: integer(value.recordVersion, 'recordVersion', 0),
      currency: text(value.currency, 'currency', 3, 3),
      items: array(value.items, 'catalog.items', 250).map((item) => {
        const entry = object(item);
        return {
          id: text(entry.id, 'service.id', 1, 100),
          title: text(entry.title, 'service.title', 2, 200),
          unitPriceMinor: integer(
            entry.unitPriceMinor,
            'service.unitPriceMinor',
            0,
            10_000_000_000,
          ),
        };
      }),
    };
  }
}
