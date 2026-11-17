import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const apps = [
  { folder: 'rep-mobile', id: 'rep', title: 'إلفورانس الميداني', nativeId: 'com.elvorance.rep' },
  {
    folder: 'client-mobile',
    id: 'client',
    title: 'مساحتي مع إلفورانس',
    nativeId: 'com.elvorance.client',
  },
  { folder: 'admin-web', id: 'admin', title: 'مركز قيادة إلفورانس' },
];
export const serviceNames = [
  'identity',
  'crm',
  'sales',
  'delivery',
  'billing',
  'tracking',
  'communications',
  'api-gateway',
];
