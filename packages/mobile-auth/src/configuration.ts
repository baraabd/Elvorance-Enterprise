import { AuthError } from './errors.ts';
import type { AuthEnvironment, MobileAuthConfig, SessionBinding } from './types.ts';

export interface ValidatedConfig extends SessionBinding {
  readonly scopes: readonly string[];
}

function parseUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new AuthError('invalid_configuration');
  }
}

/** Each native bridge additionally pins the callback to its own installed application ID. */
export function nativeRedirects(environment: AuthEnvironment): readonly string[] {
  const suffix = environment === 'production' ? '' : '.staging';
  return ['rep', 'client'].map((app) => `com.elvorance.${app}${suffix}:/oauth2redirect`);
}

export function validateConfig(config: MobileAuthConfig): ValidatedConfig {
  if (
    !config ||
    !['development', 'staging', 'production'].includes(config.environment) ||
    typeof config.clientId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(config.clientId)
  ) {
    throw new AuthError('invalid_configuration');
  }
  const issuer = parseUrl(config.issuer);
  const redirect = parseUrl(config.redirectUri);
  // The identity provider always uses TLS, including in development.
  if (
    issuer.protocol !== 'https:' ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash ||
    issuer.href !== config.issuer ||
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash ||
    redirect.href !== config.redirectUri
  ) {
    throw new AuthError('invalid_configuration');
  }
  const developmentLoopback =
    config.environment === 'development' &&
    redirect.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname);
  if (
    redirect.protocol !== 'https:' &&
    !developmentLoopback &&
    !nativeRedirects(config.environment).includes(config.redirectUri)
  ) {
    throw new AuthError('invalid_configuration');
  }
  const scopes = config.scopes ?? ['openid', 'profile'];
  if (
    !Array.isArray(scopes) ||
    !scopes.includes('openid') ||
    scopes.length > 16 ||
    scopes.some((scope) => typeof scope !== 'string' || !/^[A-Za-z0-9._:/-]{1,100}$/.test(scope))
  ) {
    throw new AuthError('invalid_configuration');
  }
  return Object.freeze({
    issuer: config.issuer,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    environment: config.environment,
    scopes: Object.freeze([...new Set(scopes)]),
  });
}

export function binding(config: ValidatedConfig): SessionBinding {
  return {
    issuer: config.issuer,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    environment: config.environment,
  };
}

export function matchesRedirect(value: string, expected: string): boolean {
  try {
    const actual = new URL(value);
    if (actual.hash || actual.username || actual.password) return false;
    actual.search = '';
    return actual.href === expected;
  } catch {
    return false;
  }
}
