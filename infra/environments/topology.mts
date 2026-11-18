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
export const imageNames = [...services, 'postgres', 'rabbitmq', 'keycloak', 'edge'] as const;
export const immutableImagePattern = /^[a-zA-Z0-9][a-zA-Z0-9./_:-]*@sha256:[a-f0-9]{64}$/;
export type ServiceName = (typeof services)[number];
export const ports = Object.fromEntries(
  services.map((name, index) => [name, 3000 + index]),
) as Record<ServiceName, number>;
export interface EnvironmentSpec {
  environment: 'staging' | 'production';
  sourceRevision: string;
  gatewayOrigin: string;
  issuer: string;
  webOrigins?: string[];
  secretsDirectory: string;
  images: Record<ServiceName | 'postgres' | 'rabbitmq' | 'keycloak' | 'edge', string>;
}

export function validatedWebOrigins(input: string[] = []): string[] {
  if (!Array.isArray(input)) throw new Error('webOrigins must be an array of exact HTTPS origins.');
  const origins = input.map((value) => {
    if (typeof value !== 'string') throw new Error('webOrigins must contain HTTPS origins.');
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname.includes('*') ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.origin === 'https://localhost'
    ) {
      throw new Error('webOrigins must contain exact HTTPS origins without paths or wildcards.');
    }
    return url.origin;
  });
  if (new Set(origins).size !== origins.length)
    throw new Error('webOrigins contains duplicate origins.');
  return origins;
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
      url.port ||
      url.hash ||
      url.search ||
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      throw new Error('Environment endpoints must use HTTPS on the standard edge port.');
  if (
    gateway.pathname !== '/' ||
    issuer.pathname !== `/realms/elvorance-${spec.environment}` ||
    gateway.hostname === issuer.hostname
  )
    throw new Error('Use a distinct gateway and identity host with the correct environment realm.');
  for (const name of imageNames) {
    if (!immutableImagePattern.test(spec.images[name] ?? ''))
      throw new Error(`Reviewed immutable image digest required: ${name}`);
  }
  validatedWebOrigins(spec.webOrigins);
}
