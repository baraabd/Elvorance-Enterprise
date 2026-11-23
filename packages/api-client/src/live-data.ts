import type { Entity, ListResult, Principal } from '@elvorance/contracts';
import {
  ApiError,
  createApiClient,
  type ClientOptions,
  type CommandOptions,
  type RequestOptions,
} from './index.ts';

export interface CustomerRecord extends Entity {
  name: string;
  repId: string;
  regionId: string | null;
  phone: string;
  email: string;
  doNotContact: boolean;
  consentVersion: number;
  notes: string;
}

export interface RegionRecord extends Entity {
  name: string;
  code: string;
  active: boolean;
}

export interface ServerRecord extends Entity {
  [key: string]: unknown;
}

export interface IdentityProfile {
  principal: Principal;
  profile: unknown | null;
  identitySource: string;
  profileVersion?: number;
}
export interface LiveDataOptions extends ClientOptions {
  signal?: AbortSignal;
}
export interface QuoteAcceptanceInput {
  expectedVersion: number;
  consent: true;
  paymentWishes?: string;
}
export interface ContractApprovalInput {
  expectedVersion: number;
  consent: true;
  signerName: string;
}
export interface CommercialDecisionInput {
  expectedVersion: number;
  decision: 'approved' | 'rejected';
  note: string;
}

export interface CreateCustomerInput {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  regionId?: string | null;
  repId?: string;
}

export interface CustomerChangeInput {
  expectedVersion: number;
  name?: string;
  phone?: string;
  email?: string;
  regionId?: string | null;
  repId?: string;
  doNotContact?: boolean;
}

export interface CreateTicketInput {
  subject: string;
  category: 'billing' | 'delivery' | 'account' | 'general';
  message: string;
  clientId?: string;
  repId?: string;
}

function idSegment(id: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new Error('Invalid record identifier.');
  }
  return id;
}

function recordArray<T extends Entity>(result: unknown): T[] {
  if (!result || typeof result !== 'object' || !('items' in result)) {
    throw new ApiError(200, 'invalid_response', 'Expected a server list response.');
  }
  const items = result.items;
  if (
    !Array.isArray(items) ||
    items.some(
      (item: unknown) =>
        !item ||
        typeof item !== 'object' ||
        !('id' in item) ||
        typeof item.id !== 'string' ||
        !('version' in item) ||
        typeof item.version !== 'number' ||
        !Number.isSafeInteger(item.version) ||
        item.version < 1,
    )
  ) {
    throw new ApiError(200, 'invalid_response', 'Server records have an invalid shape.');
  }
  return items as T[];
}

/**
 * Authenticated API facade. Only the owning backend service can persist changes.
 * It never reads demo seed data, localStorage, or another service's database.
 * The access token is provided by the host's OIDC implementation.
 */
export function createLiveDataApi(options: LiveDataOptions) {
  const http = createApiClient(options);
  function requestOptions<T extends RequestOptions>(input: T): T & RequestOptions {
    if (!options.signal) return input;
    return {
      ...input,
      signal: input.signal ? AbortSignal.any([input.signal, options.signal]) : options.signal,
    };
  }
  const get = <T>(path: string, input: RequestOptions = {}) =>
    http.get<T>(path, requestOptions(input));
  const command = <T>(path: string, input: unknown, intent: CommandOptions) =>
    http.command<T>(path, input, requestOptions(intent));
  const patch = <T>(path: string, input: unknown, intent: CommandOptions) =>
    http.patch<T>(path, input, requestOptions(intent));

  async function list<T extends Entity>(path: string): Promise<T[]> {
    const records: T[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const response = await get<ListResult<T>>(path, cursor ? { query: { cursor } } : {});
      records.push(...recordArray<T>(response));
      if (response.nextCursor == null) return records;
      if (
        typeof response.nextCursor !== 'string' ||
        !/^[a-zA-Z0-9_:-]{1,100}$/.test(response.nextCursor) ||
        cursors.has(response.nextCursor)
      )
        throw new ApiError(
          200,
          'invalid_response',
          'The server returned an invalid or repeated list cursor.',
        );
      cursors.add(response.nextCursor);
      if (cursors.size > 1000)
        throw new ApiError(200, 'list_limit', 'The result is too large to review as one list.');
      cursor = response.nextCursor;
    } while (cursor);
    return records;
  }

  return {
    identity: {
      me: () => get<IdentityProfile>('/v1/identity/me'),
      memberships: () => list<ServerRecord>('/v1/identity/memberships'),
      tenant: () => get<unknown>('/v1/identity/tenant'),
    },
    crm: {
      customers: () => list<CustomerRecord>('/v1/crm/customers'),
      customer: (id: string) => get<CustomerRecord>('/v1/crm/customers/' + idSegment(id)),
      regions: () => list<RegionRecord>('/v1/crm/regions'),
      createCustomer: (input: CreateCustomerInput, options: CommandOptions) =>
        command<CustomerRecord>('/v1/crm/customers', input, options),
      changeCustomer: (id: string, change: CustomerChangeInput, options: CommandOptions) =>
        patch<CustomerRecord>('/v1/crm/customers/' + idSegment(id), change, options),
      createRegion: (input: { name: string; code: string }, options: CommandOptions) =>
        command<RegionRecord>('/v1/crm/regions', input, options),
      configuration: () => get<unknown>('/v1/crm/configuration'),
    },
    sales: {
      visits: () => list<ServerRecord>('/v1/sales/visits'),
      quotes: () => list<ServerRecord>('/v1/sales/quotes'),
      contracts: () => list<ServerRecord>('/v1/sales/contracts'),
      quote: (id: string) => get<ServerRecord>('/v1/sales/quotes/' + idSegment(id)),
      contract: (id: string) => get<ServerRecord>('/v1/sales/contracts/' + idSegment(id)),
      discountApprovals: () => list<ServerRecord>('/v1/sales/quote-discount-approvals'),
      decideDiscount: (id: string, input: CommercialDecisionInput, options: CommandOptions) =>
        command<ServerRecord>(
          '/v1/sales/quote-discount-approvals/' + idSegment(id) + '/decision',
          input,
          options,
        ),
      acceptQuote: (id: string, input: QuoteAcceptanceInput, options: CommandOptions) =>
        command<{ quote: ServerRecord; contract: ServerRecord }>(
          '/v1/sales/quotes/' + idSegment(id) + '/accept',
          input,
          options,
        ),
      rejectQuote: (
        id: string,
        input: { expectedVersion: number; reason: string },
        options: CommandOptions,
      ) => command<ServerRecord>('/v1/sales/quotes/' + idSegment(id) + '/reject', input, options),
      requestQuoteChanges: (
        id: string,
        input: { expectedVersion: number; reason: string },
        options: CommandOptions,
      ) =>
        command<ServerRecord>(
          '/v1/sales/quotes/' + idSegment(id) + '/request-changes',
          input,
          options,
        ),
      approveContract: (id: string, input: ContractApprovalInput, options: CommandOptions) =>
        command<ServerRecord>('/v1/sales/contracts/' + idSegment(id) + '/approve', input, options),
    },
    delivery: {
      projects: () => list<ServerRecord>('/v1/delivery/projects'),
    },
    billing: {
      invoices: () => list<ServerRecord>('/v1/billing/invoices'),
      invoicePayments: (id: string) =>
        list<ServerRecord>('/v1/billing/invoices/' + idSegment(id) + '/payments'),
    },
    communications: {
      tickets: () => list<ServerRecord>('/v1/communications/tickets'),
      notifications: () => list<ServerRecord>('/v1/communications/notifications'),
      createTicket: (input: CreateTicketInput, options: CommandOptions) =>
        command<ServerRecord>('/v1/communications/tickets', input, options),
    },
    tracking: {
      latest: () => get<unknown>('/v1/tracking/latest'),
      currentSession: () => get<unknown>('/v1/tracking/sessions/current'),
    },
  };
}

export type LiveDataApi = ReturnType<typeof createLiveDataApi>;
