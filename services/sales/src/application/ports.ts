import type { CustomerContext } from '@elvorance/contracts';
export interface CustomerDirectory {
  getCustomer(id: string, authorization: string): Promise<CustomerContext>;
}
