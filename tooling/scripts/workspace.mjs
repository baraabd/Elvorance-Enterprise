import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const apps = [
  { folder: 'rep-mobile', id: 'rep', title: 'أطلس الميداني', nativeId: 'com.atlascrm.rep' },
  {
    folder: 'client-mobile',
    id: 'client',
    title: 'مساحتي مع أطلس',
    nativeId: 'com.atlascrm.client',
  },
  { folder: 'admin-web', id: 'admin', title: 'مركز قيادة أطلس' },
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
