import { randomUUID } from 'node:crypto';
import type { Principal } from '@elvorance/contracts';
import type { Customer } from '../../../services/crm/src/domain/model.ts';
import type { Invoice } from '../../../services/billing/src/domain/model.ts';
import { ensure, requiredValue, stagingTarget } from './target.mts';
import { createIdentityFixtures } from './identity-fixture.mts';
import { hostedJourney } from './journey.mts';
/** Expectations deliberately authored here; not generated from route-inventory.json. */
export async function policyChecks(
  identities: Awaited<ReturnType<typeof createIdentityFixtures>>,
  flow: Awaited<ReturnType<typeof hostedJourney>>,
  tenantId: string,
) {
  const { http, client, rep, admin, customer } = flow;
  const observations: Array<{ policy: string; passed: true }> = [];
  const passed = (policy: string) => observations.push({ policy, passed: true });
  await http.request('POST', '/v1/crm/customers', {
    session: client,
    body: { name: 'Forbidden customer', repId: 'ci-rep' },
    status: 403,
  });
  passed('A customer cannot create CRM customers');
  await http.request('PATCH', `/v1/crm/customers/${customer.id}`, {
    session: client,
    body: { expectedVersion: customer.version, repId: 'other' },
    status: 403,
  });
  passed('A customer cannot self-reassign');
  const own = await http.request<Record<string, unknown>>(
    'GET',
    `/v1/crm/customers/${customer.id}`,
    { session: client },
  );
  ensure(!('notes' in own) && !('budget' in own), 'Customer projection leaked internal fields.');
  passed('Customer view excludes internal sales notes');
  await http.request('POST', '/v1/crm/regions', {
    session: rep,
    body: { name: 'Forbidden region', code: 'NO' },
    status: 403,
  });
  passed('Representative cannot administer territories');
  await http.request('PUT', '/v1/crm/configuration', { session: rep, body: {}, status: 403 });
  passed('Representative cannot publish commercial configuration');
  await http.request('PATCH', '/v1/identity/me/profile', {
    session: client,
    body: {
      expectedVersion: 0,
      displayName: 'Staging Account',
      roles: ['admin'],
      tenantId: 'forged',
    },
    status: 400,
  });
  passed('Profile endpoint rejects access-claim escalation');
  const current = await http.request<{ principal: Principal }>('GET', '/v1/identity/me', {
    session: client,
  });
  ensure(
    current.principal.roles.join(',') === 'client' && current.principal.tenantId === tenantId,
    'Access claims changed through profile request.',
  );
  const comboAccount = await identities.create({ tenantId, roles: ['finance', 'support'] });
  const combo = await identities.login(comboAccount, 'admin');
  const comboIdentity = await http.request<{ principal: Principal }>('GET', '/v1/identity/me', {
    session: combo,
  });
  ensure(
    [...comboIdentity.principal.roles].sort().join(',') === 'finance,support',
    'Combined roles were not scoped exactly.',
  );
  passed('Combined finance/support roles are preserved without implicit admin');
  await http.request('GET', '/v1/identity/memberships', { session: combo, status: 403 });
  passed('Combined non-admin roles cannot enumerate memberships');
  await http.request('POST', '/v1/crm/regions', {
    session: combo,
    body: { name: 'Forbidden region', code: 'NO' },
    status: 403,
  });
  passed('Combining finance/support does not grant administrative commands');
  const invoice = requiredValue(
    flow.invoices.items[0],
    'Expected an invoice before policy checks.',
  );
  const pay = {
    expectedVersion: invoice.version,
    requestId: 'stg-pay-' + randomUUID(),
    amountMinor: 100,
    method: 'bank_transfer',
    reference: 'SYNTHETIC STAGING LEDGER ONLY - NO MONEY MOVEMENT',
  };
  for (const [name, session] of [
    ['client', client],
    ['rep', rep],
  ] as const) {
    await http.request('POST', `/v1/billing/invoices/${invoice.id}/payments`, {
      session,
      body: pay,
      status: 403,
    });
    passed(name + ' cannot record a payment');
  }
  const supportAccount = await identities.create({ tenantId, roles: ['support'] });
  const support = await identities.login(supportAccount, 'admin');
  await http.request('POST', `/v1/billing/invoices/${invoice.id}/payments`, {
    session: support,
    body: pay,
    status: 403,
  });
  passed('Support alone cannot record a payment');
  const p = await http.request<{ invoice: Invoice }>(
    'POST',
    `/v1/billing/invoices/${invoice.id}/payments`,
    { session: combo, body: pay },
  );
  ensure(p.invoice.paidMinor === 100, 'Finance ledger control failed.');
  passed('Combined roles retain legitimate finance permission; synthetic ledger entry persists');
  await http.request('POST', `/v1/billing/invoices/${invoice.id}/payments`, {
    session: combo,
    body: { ...pay, requestId: 'stale-' + randomUUID() },
    status: 409,
  });
  passed('Authorized finance cannot overwrite a newer invoice version');
  const after = await http.request<Invoice>('GET', `/v1/billing/invoices/${invoice.id}`, {
    session: client,
  });
  ensure(after.paidMinor === 100, 'Rejected request changed the invoice.');
  passed('Rejected stale payment has no ledger side effect');
  const dualAccount = await identities.create({
    tenantId,
    roles: ['rep', 'client'],
    repId: 'ci-rep',
    clientId: customer.id,
  });
  const dualRep = await identities.login(dualAccount, 'rep');
  const dualClient = await identities.login(dualAccount, 'client');
  for (const [expected, session] of [
    ['rep', dualRep],
    ['client', dualClient],
  ] as const) {
    const identity = await http.request<{ principal: Principal }>('GET', '/v1/identity/me', {
      session,
    });
    ensure(
      identity.principal.roles.join(',') === expected,
      'Role-specific OAuth client leaked a different role.',
    );
    passed(
      'Multi-role account receives only ' +
        expected +
        ' scope in its ' +
        expected +
        ' OAuth client',
    );
  }
  await http.request('POST', `/v1/sales/quotes/${flow.quote.id}/accept`, {
    session: dualRep,
    body: { expectedVersion: flow.quote.version, consent: true },
    status: 403,
  });
  passed('Dual-role account cannot exercise customer consent through representative token');
  let updated = await http.request<Customer>('PATCH', `/v1/crm/customers/${customer.id}`, {
    session: client,
    body: { expectedVersion: customer.version, doNotContact: true },
  });
  await http.request('POST', '/v1/sales/visits', {
    session: rep,
    body: {
      clientId: customer.id,
      scheduledAt: new Date().toISOString(),
      purpose: 'Forbidden after consent withdrawal',
    },
    status: 409,
  });
  passed('Contact withdrawal blocks new sales work through live CRM boundary');
  await http.request('PATCH', `/v1/crm/customers/${customer.id}`, {
    session: rep,
    body: { expectedVersion: updated.version, doNotContact: false },
    status: 403,
  });
  passed('Representative cannot override customer contact withdrawal');
  updated = await http.request<Customer>('PATCH', `/v1/crm/customers/${customer.id}`, {
    session: client,
    body: { expectedVersion: updated.version, doNotContact: false },
  });
  passed('Customer can explicitly restore contact consent');
  updated = await http.request<Customer>('PATCH', `/v1/crm/customers/${customer.id}`, {
    session: admin,
    body: { expectedVersion: updated.version, repId: 'ci-other-rep' },
  });
  await http.request('GET', `/v1/crm/customers/${customer.id}`, { session: rep, status: 404 });
  passed('Transferred customer is no longer visible to the former representative');
  // This is an account lifecycle test, not immediate revocation of already-issued offline JWTs.
  await identities.removeRoles(flow.repAccount, ['rep']);
  const downgraded = await identities.login(flow.repAccount, 'rep');
  await http.request('GET', '/v1/identity/me', { session: downgraded, status: 401 });
  passed('Fresh access token after role removal is rejected when no role remains');
  const oldRefresh = JSON.parse(
    requiredValue(
      dualClient.memory.get('auth-session'),
      'Expected an authenticated fixture session.',
    ),
  ).refreshToken as string;
  dualClient.advance(280000);
  ensure(await dualClient.auth.getAccessToken(), 'Refresh did not return a token.');
  dualClient.advance(0);
  const rotated = JSON.parse(
    requiredValue(
      dualClient.memory.get('auth-session'),
      'Expected an authenticated fixture session.',
    ),
  ).refreshToken as string;
  ensure(rotated !== oldRefresh, 'Refresh token did not rotate.');
  const replay = await fetch(
    stagingTarget.identityOrigin + '/realms/elvorance-staging/protocol/openid-connect/token',
    {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'elvorance-client-web-staging',
        refresh_token: oldRefresh,
      }),
    },
  );
  const replayBody = (await replay.json()) as { error?: string };
  ensure(
    replay.status === 400 && replayBody.error === 'invalid_grant',
    'Replayed refresh token was not rejected.',
  );
  passed('Hosted refresh rotation rejects old credential replay');
  await identities.enabled(dualAccount, false);
  let rejected = false;
  try {
    await identities.login(dualAccount, 'client');
  } catch {
    rejected = true;
  }
  ensure(rejected, 'Disabled account was able to sign in.');
  passed('Disabled account cannot start a new session');
  return {
    scope:
      'Explicit business policy checks independent of route inventory; developer-authored, not independent human approval',
    observations,
    passed: true,
    accessRevocationLimitation:
      'Already-issued JWTs are verified offline and can remain valid until expiration; no instantaneous access-token revocation claim.',
  };
}
