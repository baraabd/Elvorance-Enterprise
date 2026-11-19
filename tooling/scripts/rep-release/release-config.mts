export interface RepReleaseConfig {
  environment: 'staging' | 'production';
  dataMode: 'server';
  apiBaseUrl: string;
  siteTracking: false;
  auth: {
    issuer: string;
    clientId: string;
    redirectUri: string;
    environment: 'staging' | 'production';
    scopes: string[];
  };
}

function secureUrl(value: string | undefined, name: string): URL {
  if (!value) throw new Error(`${name} is required; release builds never use demo defaults.`);
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    /(?:^|\.)(?:example\.(?:com|org|net)|invalid|test)$/.test(url.hostname)
  )
    throw new Error(
      `${name} must be a real HTTPS endpoint without credentials or query parameters.`,
    );
  return url;
}

function gatewayUrl(value: string | undefined, name: string): URL {
  const url = secureUrl(value, name);
  if (url.pathname !== '/') throw new Error(`${name} must be the gateway HTTPS origin.`);
  return url;
}

export function repReleaseConfig(env: NodeJS.ProcessEnv = process.env): RepReleaseConfig {
  const environment = env.APP_ENV;
  if (environment !== 'staging' && environment !== 'production') {
    throw new Error('APP_ENV must explicitly select staging or production.');
  }
  const api = gatewayUrl(env.REP_API_BASE_URL, 'REP_API_BASE_URL');
  const issuer = secureUrl(env.REP_OIDC_ISSUER, 'REP_OIDC_ISSUER');
  if (issuer.pathname !== `/realms/elvorance-${environment}`) {
    throw new Error('The OIDC realm must match the selected isolated environment.');
  }
  const clientId = env.REP_OIDC_CLIENT_ID;
  if (clientId !== `elvorance-rep-${environment}`) {
    throw new Error('REP_OIDC_CLIENT_ID must match the selected environment.');
  }
  if (environment === 'staging' && env.REP_PRODUCTION_API_BASE_URL) {
    const productionApi = gatewayUrl(
      env.REP_PRODUCTION_API_BASE_URL,
      'REP_PRODUCTION_API_BASE_URL',
    );
    // Compare parsed origins: trailing slashes, host case and default ports are equivalent.
    if (productionApi.origin === api.origin) {
      throw new Error('Staging and production must not share a gateway.');
    }
  }
  return {
    environment,
    dataMode: 'server',
    apiBaseUrl: api.origin,
    siteTracking: false,
    auth: {
      environment,
      issuer: issuer.href,
      clientId,
      redirectUri: `com.elvorance.rep${environment === 'staging' ? '.staging' : ''}:/oauth2redirect`,
      scopes: ['openid', 'profile'],
    },
  };
}
