/** One topology is rendered separately for staging and production. No environment shares volumes or secrets. */
export const domains = [
  'identity',
  'crm',
  'sales',
  'delivery',
  'billing',
  'tracking',
  'communications',
] as const;
export const services = ['api-gateway', ...domains] as const;
export type ServiceName = (typeof services)[number];
export const ports = Object.fromEntries(
  services.map((name, index) => [name, 3000 + index]),
) as Record<ServiceName, number>;
export interface EnvironmentSpec {
  environment: 'staging' | 'production';
  sourceRevision: string;
  gatewayOrigin: string;
  issuer: string;
  secretsDirectory: string;
  images: Record<ServiceName | 'postgres' | 'rabbitmq' | 'keycloak' | 'edge', string>;
}
export function validateEnvironment(spec: EnvironmentSpec): void {
  if (
    !['staging', 'production'].includes(spec.environment) ||
    !/^[a-f0-9]{40}$/.test(spec.sourceRevision)
  )
    throw new Error('An explicit environment and immutable source revision are required.');
  const gateway = new URL(spec.gatewayOrigin);
  const issuer = new URL(spec.issuer);
  for (const url of [gateway, issuer])
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      ['localhost', '127.0.0.1'].includes(url.hostname)
    )
      throw new Error('Environment endpoints must use HTTPS.');
  if (
    gateway.pathname !== '/' ||
    issuer.pathname !== `/realms/elvorance-${spec.environment}` ||
    gateway.hostname === issuer.hostname
  )
    throw new Error('Use a distinct gateway and identity host with the correct environment realm.');
  for (const name of [...services, 'postgres', 'rabbitmq', 'keycloak', 'edge'] as const) {
    if (!/^[a-zA-Z0-9./_-]+@sha256:[a-f0-9]{64}$/.test(spec.images[name] ?? ''))
      throw new Error(`Reviewed immutable image digest required: ${name}`);
  }
}
