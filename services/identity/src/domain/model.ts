import type { Entity, Role } from '@elvorance/contracts';
export interface TenantProfile extends Entity {
  name: string;
  locale: string;
  currency: string;
}
export interface Membership extends Entity {
  subject: string;
  displayName: string;
  roles: Role[];
  status: 'active' | 'disabled';
}
