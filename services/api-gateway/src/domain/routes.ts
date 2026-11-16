export const serviceNames = [
  'identity',
  'crm',
  'sales',
  'delivery',
  'billing',
  'tracking',
  'communications',
] as const;
export type ServiceName = (typeof serviceNames)[number];
export type Upstreams = Record<ServiceName, string>;
