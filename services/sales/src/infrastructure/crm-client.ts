import type { CustomerContext } from '@atlas/contracts';
import { AppError, assert, object, text, integer } from '@atlas/service-kit';
import type { CustomerDirectory } from '../application/ports.ts';
export class HttpCustomerDirectory implements CustomerDirectory {
  constructor(private readonly origin: string) {
    const url = new URL(origin);
    assert(
      ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password,
      'CONFIGURATION',
      'CRM_URL must be an HTTP origin',
      500,
    );
  }
  async getCustomer(id: string, authorization: string): Promise<CustomerContext> {
    let response: Response;
    try {
      response = await fetch(
        `${this.origin.replace(/\/$/, '')}/v1/customers/${encodeURIComponent(id)}/context`,
        { headers: { authorization }, signal: AbortSignal.timeout(5000), redirect: 'error' },
      );
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
    const value = object(await response.json());
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
}
