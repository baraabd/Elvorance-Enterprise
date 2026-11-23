import type { ProtocolMapper } from './types.mts';

export function mapper(
  name: string,
  provider: string,
  config: Record<string, string>,
): ProtocolMapper {
  return { name, protocol: 'openid-connect', protocolMapper: provider, config };
}

export function applicationClaims(audience: string): ProtocolMapper[] {
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
