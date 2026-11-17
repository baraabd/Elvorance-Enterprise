import type { Entity, ListResult, Principal } from '@elvorance/contracts';
import { ApiError, createApiClient, type ClientOptions, type CommandOptions } from './index.ts';

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
  body: string;
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
        typeof item.version !== 'number',
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
export function createLiveDataApi(options: ClientOptions) {
  const http = createApiClient(options);

  async function list<T extends Entity>(path: string): Promise<T[]> {
    const response = await http.get<ListResult<T>>(path);
    return recordArray<T>(response);
  }

  return {
    identity: {
      me: () => http.get<IdentityProfile>('/v1/identity/me'),
      memberships: () => list<ServerRecord>('/v1/identity/memberships'),
      tenant: () => http.get<unknown>('/v1/identity/tenant'),
    },
    crm: {
      customers: () => list<CustomerRecord>('/v1/crm/customers'),
      customer: (id: string) => http.get<CustomerRecord>('/v1/crm/customers/' + idSegment(id)),
      regions: () => list<RegionRecord>('/v1/crm/regions'),
      createCustomer: (input: CreateCustomerInput, options: CommandOptions) =>
        http.command<CustomerRecord>('/v1/crm/customers', input, options),
      changeCustomer: (id: string, change: CustomerChangeInput, options: CommandOptions) =>
        http.patch<CustomerRecord>('/v1/crm/customers/' + idSegment(id), change, options),
      createRegion: (input: { name: string; code: string }, options: CommandOptions) =>
        http.command<RegionRecord>('/v1/crm/regions', input, options),
      configuration: () => http.get<unknown>('/v1/crm/configuration'),
    },
    sales: {
      visits: () => list<ServerRecord>('/v1/sales/visits'),
      quotes: () => list<ServerRecord>('/v1/sales/quotes'),
      contracts: () => list<ServerRecord>('/v1/sales/contracts'),
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
        http.command<ServerRecord>('/v1/communications/tickets', input, options),
    },
    tracking: {
      latest: () => http.get<unknown>('/v1/tracking/latest'),
      currentSession: () => http.get<unknown>('/v1/tracking/sessions/current'),
    },
  };
}

export type LiveDataApi = ReturnType<typeof createLiveDataApi>;
