import type { Entity } from '@atlas/contracts';
export interface Customer extends Entity {
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
