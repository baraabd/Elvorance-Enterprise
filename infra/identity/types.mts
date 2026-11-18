export type IdentityEnvironment = 'staging' | 'production';
export type JsonRecord = Record<string, unknown>;

export interface IdentityInput {
  environment: IdentityEnvironment;
  /** Public HTTPS origin of this environment's dedicated Keycloak deployment. */
  baseUrl: string;
  webRedirectUri?: string;
  webOrigin?: string;
}

export interface ProtocolMapper {
  name: string;
  protocol: 'openid-connect';
  protocolMapper: string;
  config: Record<string, string>;
}

export interface IdentityClient {
  clientId: string;
  name: string;
  protocol: 'openid-connect';
  enabled: boolean;
  publicClient: boolean;
  bearerOnly: boolean;
  standardFlowEnabled: boolean;
  implicitFlowEnabled: boolean;
  directAccessGrantsEnabled: boolean;
  serviceAccountsEnabled: boolean;
  fullScopeAllowed: boolean;
  redirectUris: string[];
  webOrigins: string[];
  defaultClientScopes: string[];
  optionalClientScopes: string[];
  attributes: Record<string, string>;
  protocolMappers: ProtocolMapper[];
}

export interface UserProfileAttribute {
  name: string;
  displayName: string;
  multivalued: false;
  permissions: { view: string[]; edit: string[] };
  validations: JsonRecord;
  required?: { roles: string[] };
}

export interface UserProfile {
  unmanagedAttributePolicy: 'DISABLED';
  attributes: UserProfileAttribute[];
  groups: never[];
}

export interface IdentityDefinition {
  realm: JsonRecord & { realm: string; enabled: false; clients: IdentityClient[] };
  userProfile: UserProfile;
  publicConfig: {
    environment: IdentityEnvironment;
    issuer: string;
    audience: string;
    clientId: string;
    redirectUri: string;
    authorizationEndpoint: string;
    jwksUrl: string;
    webClientId?: string;
    webRedirectUri?: string;
  };
}
