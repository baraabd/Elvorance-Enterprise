import type { UserProfile, UserProfileAttribute } from './types.mts';

/** Authorization attributes are administered centrally and cannot be changed in Account Console. */
function managedAttribute(name: string): UserProfileAttribute {
  return {
    name,
    displayName: name,
    multivalued: false,
    permissions: { view: ['admin'], edit: ['admin'] },
    validations: { length: { min: 1, max: 100 }, pattern: { pattern: '^[A-Za-z0-9_-]{1,100}$' } },
  };
}

export function userProfile(): UserProfile {
  return {
    unmanagedAttributePolicy: null,
    attributes: [
      {
        name: 'username',
        displayName: '${username}',
        multivalued: false,
        permissions: { view: ['admin', 'user'], edit: ['admin'] },
        validations: {
          length: { min: 3, max: 255 },
          'username-prohibited-characters': {},
          'up-username-not-idn-homograph': {},
        },
        required: { roles: ['admin', 'user'] },
      },
      {
        name: 'email',
        displayName: '${email}',
        multivalued: false,
        permissions: { view: ['admin', 'user'], edit: ['admin'] },
        validations: { email: {}, length: { max: 255 } },
      },
      ...['firstName', 'lastName'].map(
        (name): UserProfileAttribute => ({
          name,
          displayName: '${' + name + '}',
          multivalued: false,
          permissions: { view: ['admin', 'user'], edit: ['admin', 'user'] },
          validations: { length: { max: 100 }, 'person-name-prohibited-characters': {} },
        }),
      ),
      { ...managedAttribute('tenant_id'), required: { roles: ['admin'] } },
      managedAttribute('rep_id'),
      managedAttribute('client_id'),
    ],
    groups: [],
  };
}
