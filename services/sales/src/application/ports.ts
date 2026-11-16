import type { CustomerContext } from '@atlas/contracts';
export interface CustomerDirectory {
  getCustomer(id: string, authorization: string): Promise<CustomerContext>;
}
