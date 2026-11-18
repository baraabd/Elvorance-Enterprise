import { mapper } from './mappers.mts';

/** Declare scopes explicitly: omitting this collection imports Keycloak's broad default scopes. */
export function clientScopes() {
  const profileFlags = {
    'id.token.claim': 'true',
    'access.token.claim': 'false',
    'userinfo.token.claim': 'true',
    'introspection.token.claim': 'false',
  };
  return [
    {
      name: 'basic',
      protocol: 'openid-connect',
      attributes: { 'include.in.token.scope': 'false', 'display.on.consent.screen': 'false' },
      protocolMappers: [
        mapper('sub', 'oidc-sub-mapper', {
          'access.token.claim': 'true',
          'introspection.token.claim': 'true',
        }),
        mapper('auth_time', 'oidc-usersessionmodel-note-mapper', {
          'user.session.note': 'AUTH_TIME',
          'claim.name': 'auth_time',
          'jsonType.label': 'long',
          'id.token.claim': 'true',
          'access.token.claim': 'true',
          'userinfo.token.claim': 'false',
          'introspection.token.claim': 'true',
        }),
      ],
    },
    {
      name: 'profile',
      protocol: 'openid-connect',
      attributes: { 'include.in.token.scope': 'true', 'display.on.consent.screen': 'false' },
      protocolMappers: [
        ['username', 'preferred_username'],
        ['firstName', 'given_name'],
        ['lastName', 'family_name'],
      ].map(([attribute, claim]) =>
        mapper('profile-' + claim, 'oidc-usermodel-attribute-mapper', {
          ...profileFlags,
          'user.attribute': attribute!,
          'claim.name': claim!,
          'jsonType.label': 'String',
          multivalued: 'false',
        }),
      ),
    },
  ];
}
