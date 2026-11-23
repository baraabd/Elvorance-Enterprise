import { randomBytes } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { createAuthSession } from '../../../packages/mobile-auth/src/session.ts';
import type { MobileAuth } from '../../../packages/mobile-auth/src/types.ts';
import { identityAdmin, identityDefinition } from './bootstrap.mts';
import { assertStaging, ensure, stagingTarget } from './target.mts';
export type WebRole = 'admin' | 'rep' | 'client';
export interface FixtureAccount {
  id: string;
  username: string;
  password: string;
  roles: string[];
  tenantId: string;
  repId?: string;
  clientId?: string;
}
export interface HostedSession {
  auth: MobileAuth;
  memory: Map<string, string>;
  advance: (ms: number) => void;
}
const realm = '/admin/realms/elvorance-staging';
export async function createIdentityFixtures() {
  assertStaging();
  const accounts: FixtureAccount[] = [];
  const sessions: HostedSession[] = [];
  const admin = await identityAdmin();
  const info = (await admin.get('/admin/serverinfo')) as { systemInfo?: { version?: string } };
  const clients = (await admin.get(realm + '/clients?clientId=elvorance-api-staging')) as Array<{
    id: string;
  }>;
  const api = clients[0];
  ensure(api && clients.length === 1, 'Exactly one API audience client required.');
  async function create(input: {
    roles: string[];
    tenantId: string;
    repId?: string;
    clientId?: string;
  }): Promise<FixtureAccount> {
    const operator = await identityAdmin();
    const username = 'stg-accept-' + randomBytes(10).toString('hex');
    const password = 'Aa1!' + randomBytes(32).toString('base64url');
    ensure(
      input.tenantId.startsWith('stg-accept-'),
      'Only synthetic acceptance tenants may be provisioned.',
    );
    await operator.write('POST', realm + '/users', {
      username,
      enabled: true,
      emailVerified: true,
      email: username + '@example.invalid',
      firstName: 'Staging',
      lastName: 'Acceptance',
      attributes: {
        tenant_id: [input.tenantId],
        ...(input.repId ? { rep_id: [input.repId] } : {}),
        ...(input.clientId ? { client_id: [input.clientId] } : {}),
      },
      credentials: [{ type: 'password', value: password, temporary: false }],
    });
    const users = (await operator.get(
      realm + '/users?username=' + username + '&exact=true',
    )) as Array<{ id: string }>;
    ensure(users.length === 1 && users[0], 'Created fixture account lookup failed.');
    const account: FixtureAccount = { ...input, username, password, id: users[0].id };
    accounts.push(account);
    const roles = await Promise.all(
      input.roles.map((role) =>
        operator.get(realm + '/clients/' + api!.id + '/roles/' + encodeURIComponent(role)),
      ),
    );
    if (roles.length)
      await operator.write(
        'POST',
        realm + '/users/' + account.id + '/role-mappings/clients/' + api!.id,
        roles,
      );
    return account;
  }
  async function removeRoles(account: FixtureAccount, roles: string[]) {
    ensure(accounts.includes(account), 'Only this run fixture accounts may be changed.');
    const operator = await identityAdmin();
    const mappings = await Promise.all(
      roles.map((role) =>
        operator.get(realm + '/clients/' + api!.id + '/roles/' + encodeURIComponent(role)),
      ),
    );
    await operator.remove(
      realm + '/users/' + account.id + '/role-mappings/clients/' + api!.id,
      mappings,
    );
  }
  async function enabled(account: FixtureAccount, value: boolean) {
    ensure(accounts.includes(account), 'Only this run fixture accounts may be changed.');
    const operator = await identityAdmin();
    await operator.write('PUT', realm + '/users/' + account.id, { enabled: value });
    if (!value) await operator.write('POST', realm + '/users/' + account.id + '/logout', {});
  }
  async function login(account: FixtureAccount, role: WebRole): Promise<HostedSession> {
    ensure(accounts.includes(account), 'Unknown fixture account.');
    const cookies = new Map<string, string>();
    const memory = new Map<string, string>();
    let offset = 0;
    async function browser(url: string, options: RequestInit = {}) {
      ensure(
        new URL(url).origin === stagingTarget.identityOrigin,
        'Credential browser cannot leave its identity origin.',
      );
      const response = await fetch(url, {
        ...options,
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
        headers: {
          ...options.headers,
          cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; '),
        },
      });
      for (const c of response.headers.getSetCookie()) {
        const pair = c.split(';')[0]!;
        const i = pair.indexOf('=');
        if (i > 0) cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
      return response;
    }
    const config = {
      environment: 'staging' as const,
      issuer: identityDefinition().publicConfig.issuer,
      clientId: `elvorance-${role}-web-staging`,
      redirectUri: stagingTarget.web[role] + '/callback',
      scopes: ['openid', 'profile'],
    };
    const auth = createAuthSession(config, {
      now: () => Date.now() + offset,
      storage: {
        async get(k) {
          return memory.get(k) ?? null;
        },
        async set(k, v) {
          memory.set(k, v);
        },
        async remove(k) {
          memory.delete(k);
        },
      },
      browser: {
        async authorize(url, redirectUri) {
          let page = await browser(url);
          let submitted = false;
          for (let i = 0; i < 12; i++) {
            const location = page.headers.get('location');
            if (location) {
              if (location.startsWith(redirectUri + '?')) return location;
              page = await browser(new URL(location, url).href);
              continue;
            }
            ensure(page.ok, 'Hosted authorization page was unavailable.');
            const dom = new JSDOM(await page.text());
            try {
              const form = dom.window.document.querySelector<HTMLFormElement>('form#kc-form-login');
              ensure(
                form && !submitted,
                'Hosted identity rejected fixture sign-in or requires an unhandled interaction.',
              );
              const target = new URL(
                form.getAttribute('action') ?? '',
                stagingTarget.identityOrigin,
              );
              ensure(
                target.origin === stagingTarget.identityOrigin,
                'Unsafe credential form destination.',
              );
              const fields = new URLSearchParams();
              for (const el of form.querySelectorAll<HTMLInputElement>(
                'input[type="hidden"][name]',
              ))
                fields.set(el.name, el.value);
              fields.set('username', account.username);
              fields.set('password', account.password);
              submitted = true;
              page = await browser(target.href, {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: fields,
              });
            } finally {
              dom.window.close();
            }
          }
          throw new Error('Hosted sign-in redirect limit exceeded.');
        },
        async getLaunchUrl() {
          return null;
        },
        async onCallback() {
          return async () => {};
        },
        clearCallback() {},
        async cancelAuthorization() {},
      },
    });
    const result = {
      auth,
      memory,
      advance: (ms: number) => {
        offset = ms;
      },
    };
    sessions.push(result);
    ensure((await auth.signIn()).status === 'authenticated', 'Hosted OIDC did not authenticate.');
    return result;
  }
  async function cleanup() {
    const failures: string[] = [];
    for (const session of sessions) {
      try {
        await session.auth.signOut();
        await session.auth.dispose();
      } catch {
        failures.push('session-revocation');
      }
    }
    for (const account of accounts) {
      try {
        const operator = await identityAdmin();
        await operator.remove(realm + '/users/' + account.id);
      } catch {
        failures.push('fixture-account-deletion');
      }
    }
    ensure(failures.length === 0, 'Fixture cleanup incomplete: ' + failures.join(','));
    return { accountsDeleted: accounts.length, sessionsClosed: sessions.length };
  }
  return {
    create,
    login,
    removeRoles,
    enabled,
    cleanup,
    keycloak: info.systemInfo?.version ?? 'unknown',
  };
}
