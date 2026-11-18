import { roles } from '../../packages/contracts/src/index.ts';
import { userProfile } from './user-profile.mts';
import type {
  IdentityClient,
  IdentityDefinition,
  IdentityInput,
  ProtocolMapper,
} from './types.mts';

function secureUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Identity configuration requires valid HTTPS URLs.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    value.includes('*')
  ) {
    throw new Error(
      'Identity configuration requires exact HTTPS URLs without credentials, queries or fragments.',
    );
  }
  return url;
}

function mapper(name: string, provider: string, config: Record<string, string>): ProtocolMapper {
  return { name, protocol: 'openid-connect', protocolMapper: provider, config };
}

function applicationClaims(audience: string): ProtocolMapper[] {
  const tokenFlags = {
    'access.token.claim': 'true',
    'id.token.claim': 'false',
    'userinfo.token.claim': 'false',
    'introspection.token.claim': 'true',
  };
  return [
    ...['tenant_id', 'rep_id', 'client_id'].map((attribute) =>
      mapper(`elvorance-${attribute}`, 'oidc-usermodel-attribute-mapper', {
        ...tokenFlags,
        'user.attribute': attribute,
        'claim.name': attribute,
        'jsonType.label': 'String',
        multivalued: 'false',
      }),
    ),
    mapper('elvorance-api-roles', 'oidc-usermodel-client-role-mapper', {
      ...tokenFlags,
      'usermodel.clientRoleMapping.clientId': audience,
      'claim.name': 'roles',
      'jsonType.label': 'String',
      multivalued: 'true',
    }),
    mapper('elvorance-api-audience', 'oidc-audience-mapper', {
      'included.client.audience': audience,
      'access.token.claim': 'true',
      'id.token.claim': 'false',
      'introspection.token.claim': 'true',
    }),
  ];
}

function client(
  clientId: string,
  audience: string,
  redirectUris: string[],
  webOrigins: string[],
  bearerOnly = false,
): IdentityClient {
  return {
    clientId,
    name: clientId,
    protocol: 'openid-connect',
    enabled: true,
    publicClient: !bearerOnly,
    bearerOnly,
    standardFlowEnabled: !bearerOnly,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    fullScopeAllowed: false,
    redirectUris,
    webOrigins,
    defaultClientScopes: bearerOnly ? [] : ['basic', 'profile'],
    optionalClientScopes: [],
    attributes: {
      'pkce.code.challenge.method': 'S256',
      'id.token.signed.response.alg': 'RS256',
      'access.token.signed.response.alg': 'RS256',
      'exclude.issuer.from.auth.response': 'false',
      'oauth2.device.authorization.grant.enabled': 'false',
      'oidc.ciba.grant.enabled': 'false',
      'standard.token.exchange.enabled': 'false',
      'use.refresh.tokens': bearerOnly ? 'false' : 'true',
      'client.use.lightweight.access.token.enabled': 'false',
      'access.token.lifespan': '300',
      'client.session.idle.timeout': '1800',
      'client.session.max.lifespan': '28800',
    },
    protocolMappers: bearerOnly ? [] : applicationClaims(audience),
  };
}

/** No accounts, passwords, signing keys or mutable production resources enter this definition. */
export function createIdentityDefinition(input: IdentityInput): IdentityDefinition {
  if (!['staging', 'production'].includes(input.environment))
    throw new Error('Identity environment must be staging or production.');
  const base = secureUrl(input.baseUrl);
  if (base.pathname !== '/' || base.origin !== input.baseUrl.replace(/\/$/, '')) {
    throw new Error('Keycloak base URL must be a dedicated HTTPS origin.');
  }
  if (Boolean(input.webRedirectUri) !== Boolean(input.webOrigin)) {
    throw new Error('A web client requires both an exact redirect URI and an explicit origin.');
  }
  const suffix = input.environment;
  const realmName = `elvorance-${suffix}`;
  const audience = `elvorance-api-${suffix}`;
  const nativeId = `elvorance-rep-${suffix}`;
  const redirectUri =
    suffix === 'production'
      ? 'com.elvorance.rep:/oauth2redirect'
      : 'com.elvorance.rep.staging:/oauth2redirect';
  const issuer = `${base.origin}/realms/${realmName}`;
  const clients = [
    client(audience, audience, [], [], true),
    client(nativeId, audience, [redirectUri], ['capacitor://localhost', 'https://localhost']),
  ];
  let webConfig: Pick<IdentityDefinition['publicConfig'], 'webClientId' | 'webRedirectUri'> = {};
  if (input.webRedirectUri && input.webOrigin) {
    const redirect = secureUrl(input.webRedirectUri);
    const origin = secureUrl(input.webOrigin);
    if (
      origin.origin !== input.webOrigin ||
      origin.origin !== redirect.origin ||
      redirect.href !== input.webRedirectUri
    ) {
      throw new Error(
        'Web redirect URI must be canonical and belong to the supplied exact HTTPS origin.',
      );
    }
    const webClientId = `elvorance-rep-web-${suffix}`;
    clients.push(client(webClientId, audience, [redirect.href], [origin.origin]));
    webConfig = { webClientId, webRedirectUri: redirect.href };
  }
  return {
    realm: {
      realm: realmName,
      displayName: `Elvorance ${suffix}`,
      enabled: false,
      sslRequired: 'all',
      registrationAllowed: false,
      registrationEmailAsUsername: false,
      loginWithEmailAllowed: true,
      duplicateEmailsAllowed: false,
      editUsernameAllowed: false,
      resetPasswordAllowed: false,
      rememberMe: false,
      verifyEmail: true,
      userManagedAccessAllowed: false,
      defaultSignatureAlgorithm: 'RS256',
      revokeRefreshToken: true,
      refreshTokenMaxReuse: 0,
      accessTokenLifespan: 300,
      accessCodeLifespan: 60,
      accessCodeLifespanLogin: 300,
      accessCodeLifespanUserAction: 300,
      ssoSessionIdleTimeout: 1800,
      ssoSessionMaxLifespan: 28800,
      clientSessionIdleTimeout: 1800,
      clientSessionMaxLifespan: 28800,
      offlineSessionMaxLifespanEnabled: true,
      offlineSessionMaxLifespan: 28800,
      bruteForceProtected: true,
      permanentLockout: false,
      failureFactor: 5,
      waitIncrementSeconds: 60,
      maxFailureWaitSeconds: 900,
      quickLoginCheckMilliSeconds: 1000,
      minimumQuickLoginWaitSeconds: 60,
      maxDeltaTimeSeconds: 43200,
      passwordPolicy:
        'length(14) and notUsername(undefined) and notEmail(undefined) and passwordHistory(5)',
      defaultDefaultClientScopes: ['basic', 'profile'],
      defaultOptionalClientScopes: [],
      eventsEnabled: true,
      eventsExpiration: 604800,
      adminEventsEnabled: true,
      adminEventsDetailsEnabled: false,
      browserSecurityHeaders: {
        contentSecurityPolicy: "frame-src 'self'; frame-ancestors 'self'; object-src 'none';",
        contentSecurityPolicyReportOnly: '',
        xContentTypeOptions: 'nosniff',
        xFrameOptions: 'SAMEORIGIN',
        xRobotsTag: 'none',
        strictTransportSecurity: 'max-age=31536000; includeSubDomains',
        referrerPolicy: 'no-referrer',
      },
      attributes: {
        'elvorance.environment': suffix,
        'elvorance.managed-by': 'Elvorance-Enterprise/infra/identity',
        'elvorance.schema-version': '1',
      },
      clients,
      roles: { client: { [audience]: roles.map((name) => ({ name, composite: false })) } },
      // Scope restriction prevents default realm roles or other client roles becoming application roles.
      clientScopeMappings: {
        [audience]: clients
          .filter((item) => !item.bearerOnly)
          .map((item) => ({ client: item.clientId, roles: ['rep'] })),
      },
    },
    userProfile: userProfile(),
    publicConfig: {
      environment: suffix,
      issuer,
      audience,
      clientId: nativeId,
      redirectUri,
      authorizationEndpoint: `${issuer}/protocol/openid-connect/auth`,
      jwksUrl: `${issuer}/protocol/openid-connect/certs`,
      ...webConfig,
    },
  };
}

export function identityInputFromEnv(env: NodeJS.ProcessEnv = process.env): IdentityInput {
  const environment = env.ELVORANCE_ENVIRONMENT;
  const baseUrl = env.KEYCLOAK_BASE_URL;
  if ((environment !== 'staging' && environment !== 'production') || !baseUrl) {
    throw new Error('Set ELVORANCE_ENVIRONMENT and KEYCLOAK_BASE_URL.');
  }
  return {
    environment,
    baseUrl,
    ...(env.KEYCLOAK_REP_WEB_REDIRECT_URI
      ? { webRedirectUri: env.KEYCLOAK_REP_WEB_REDIRECT_URI }
      : {}),
    ...(env.KEYCLOAK_REP_WEB_ORIGIN ? { webOrigin: env.KEYCLOAK_REP_WEB_ORIGIN } : {}),
  };
}
