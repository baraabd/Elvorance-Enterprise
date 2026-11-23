import type { Entity } from '@elvorance/contracts';
import type { CustomerDetails } from './customer-details.ts';
export interface Customer extends Entity, CustomerDetails {
  name: string;
  repId: string;
  regionId: string | null;
  phone: string;
  email: string;
  doNotContact: boolean;
  consentVersion: number;
  notes: string;
}
export interface Region extends Entity {
  name: string;
  code: string;
  active: boolean;
}
