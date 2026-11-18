import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import { mountLiveWorkspace } from '../../packages/api-client/src/live-workspace.ts';
import { repFixture } from '../backend/rep-fixture.ts';
import { call } from '../backend/helpers.ts';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (
    html: string,
    options: { url: string },
  ) => { window: Window & Pick<typeof globalThis, 'Event'> };
};
async function until(predicate: () => boolean, reason: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(reason);
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}
async function fixture(t: TestContext) {
  const services = await repFixture(t);
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://web.staging.example/' });
  const root = dom.window.document.querySelector<HTMLElement>('#app')!;
  const servicesByName: Record<string, FastifyInstance> = {
    crm: services.crm,
    sales: services.sales,
    identity: services.identity,
    communications: services.communications,
  };
  const requests: {
    path: string;
    method: string;
    body: Record<string, unknown> | null;
    key: string | null;
    status: number;
  }[] = [];
  let loseResponse = false;
  let cleanup = () => {};
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  return {
    ...services,
    dom,
    root,
    requests,
    dropCommittedResponse() {
      loseResponse = true;
    },
    async mount(role: 'admin' | 'client', signal?: AbortSignal) {
      cleanup();
      cleanup = await mountLiveWorkspace({
        root,
        role,
        baseUrl: 'https://gateway.staging.example',
        accessToken: async () => role,
        ...(signal ? { signal } : {}),
        fetch: async (input, init) => {
          const url = new URL(String(input));
          const method = (init?.method ?? 'GET') as 'GET' | 'POST' | 'PATCH' | 'PUT';
          const service = servicesByName[url.pathname.split('/')[2]!];
          if (
            !service &&
            method === 'GET' &&
            ['/v1/billing/invoices', '/v1/delivery/projects'].includes(url.pathname)
          )
            return Response.json({ items: [], nextCursor: null });
          assert.ok(service, `Unexpected service ${url.pathname}`);
          const headers = new Headers(init?.headers);
          const body = init?.body
            ? (JSON.parse(String(init.body)) as Record<string, unknown>)
            : null;
          const response = await service.inject({
            method,
            url: url.pathname.replace(/^\/v1\/[^/]+/, '/v1') + url.search,
            headers: Object.fromEntries(headers),
            ...(body ? { payload: body } : {}),
          });
          requests.push({
            path: url.pathname,
            method,
            body,
            key: headers.get('idempotency-key'),
            status: response.statusCode,
          });
          if (loseResponse && method !== 'GET' && response.statusCode === 200) {
            loseResponse = false;
            throw new TypeError('Response lost after server commit');
          }
          return new Response(response.body, {
            status: response.statusCode,
            headers: { 'content-type': 'application/json' },
          });
        },
      });
      return cleanup;
    },
  };
}
async function section(root: HTMLElement, id: string): Promise<void> {
  const button = root.querySelector<HTMLButtonElement>(`[data-live-section="${id}"]`);
  assert.ok(button);
  button.click();
  await until(
    () => root.querySelector('#live-content')?.getAttribute('aria-busy') === 'false',
    'Section did not load',
  );
}
async function review(root: HTMLElement, id: string): Promise<void> {
  const button = root.querySelector<HTMLButtonElement>(`[data-live-review][data-id="${id}"]`);
  assert.ok(button, 'Expected a review button');
  button.click();
  await until(
    () => root.querySelector('#live-content')?.getAttribute('aria-busy') === 'false',
    'Record review did not load',
  );
}
function fill(form: HTMLFormElement, values: Record<string, string | boolean>): void {
  const window = form.ownerDocument.defaultView!;
  for (const [name, value] of Object.entries(values)) {
    const control = form.elements.namedItem(name) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement;
    assert.ok(control);
    if (control instanceof window.HTMLInputElement && control.type === 'checkbox')
      control.checked = Boolean(value);
    else control.value = String(value);
    control.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
}
async function submit(form: HTMLFormElement): Promise<void> {
  const window = form.ownerDocument.defaultView!;
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => form.dataset.pending !== 'true', 'Command did not settle');
}

test('admin approval → sent quote → explicit client acceptance → separate signature approval persists through real services', async (t) => {
  const f = await fixture(t);
  await f.publish();
  const visit = await f.start();
  const draft = (await call(f.sales, 'POST', '/v1/quotes', 'rep', f.quoteInput(visit.id, 2000)))
    .body;
  const approval = (
    await call(f.sales, 'POST', `/v1/quotes/${draft.id}/discount-approval`, 'rep', {
      expectedVersion: draft.version,
      reason: 'Reviewed exception for long-term scope',
    })
  ).body;
  await f.mount('admin');
  await review(f.root, approval.id);
  const decision = f.root.querySelector<HTMLFormElement>('[data-live-form="discount-decision"]')!;
  assert.ok(decision);
  assert.match(f.root.textContent ?? '', /Customer website/);
  assert.match(f.root.textContent ?? '', /Scope and payment terms/);
  fill(decision, { decision: 'approved', note: 'Approved after scope and margin review' });
  await submit(decision);
  assert.equal(
    f.requests.filter((entry) => entry.path.endsWith('/decision')).length,
    0,
    'An unchecked review acknowledgement cannot decide',
  );
  fill(decision, { consent: true });
  await submit(decision);
  assert.equal(
    (await call(f.sales, 'GET', `/v1/quotes/${draft.id}`, 'rep')).body.status,
    'draft',
    'Admin approval never sends or accepts the quote automatically',
  );
  const sent = (
    await call(f.sales, 'POST', `/v1/quotes/${draft.id}/send`, 'rep', {
      expectedVersion: draft.version,
    })
  ).body;
  await f.mount('client');
  await section(f.root, 'quotes');
  await review(f.root, draft.id);
  const accept = f.root.querySelector<HTMLFormElement>('[data-live-form="quote-accept"]')!;
  assert.ok(accept);
  assert.equal((accept.elements.namedItem('consent') as HTMLInputElement).checked, false);
  await submit(accept);
  assert.equal(f.requests.filter((entry) => entry.path.endsWith('/accept')).length, 0);
  fill(accept, { consent: true, paymentWishes: 'Please use bank transfer' });
  f.dropCommittedResponse();
  await submit(accept);
  assert.match(f.root.querySelector('#live-notice')?.textContent ?? '', /فشل طلب البيانات/);
  assert.equal(
    (await call(f.sales, 'GET', `/v1/quotes/${draft.id}`, 'client')).body.status,
    'accepted',
  );
  let contracts = (await call(f.sales, 'GET', '/v1/contracts', 'client')).body.items;
  assert.equal(contracts.length, 1);
  assert.equal(contracts[0].status, 'pending');
  await submit(accept);
  const acceptRequests = f.requests.filter((entry) => entry.path.endsWith('/accept'));
  assert.equal(acceptRequests.length, 2);
  assert.equal(acceptRequests[0]!.key, acceptRequests[1]!.key);
  assert.deepEqual(acceptRequests[0]!.body, {
    expectedVersion: sent.version,
    consent: true,
    paymentWishes: 'Please use bank transfer',
  });
  await section(f.root, 'contracts');
  await review(f.root, contracts[0].id);
  const sign = f.root.querySelector<HTMLFormElement>('[data-live-form="contract-approve"]')!;
  assert.ok(sign);
  fill(sign, { signerName: 'Customer Authorized Signer' });
  await submit(sign);
  assert.equal(
    f.requests.filter((entry) => /\/contracts\/.+\/approve$/.test(entry.path)).length,
    0,
  );
  fill(sign, { consent: true });
  await submit(sign);
  contracts = (await call(f.sales, 'GET', '/v1/contracts', 'client')).body.items;
  assert.equal(contracts.length, 1);
  assert.equal(contracts[0].status, 'approved');
  assert.equal(contracts[0].signerName, 'Customer Authorized Signer');
  assert.equal(
    f.requests.filter((entry) => /\/contracts\/.+\/approve$/.test(entry.path))[0]!.body!
      .expectedVersion,
    1,
  );
});

test('client can request changes or reject with a reason; a stale review cannot overwrite a newer decision', async (t) => {
  const f = await fixture(t);
  await f.publish();
  const visit = await f.start();
  const quotes: { id: string; version: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const draft = (await call(f.sales, 'POST', '/v1/quotes', 'rep', f.quoteInput(visit.id))).body;
    const sent = (
      await call(f.sales, 'POST', `/v1/quotes/${draft.id}/send`, 'rep', {
        expectedVersion: draft.version,
      })
    ).body;
    quotes.push({ id: String(sent.id), version: Number(sent.version) });
  }
  await f.mount('client');
  await section(f.root, 'quotes');
  await review(f.root, quotes[0]!.id);
  const changes = f.root.querySelector<HTMLFormElement>('[data-live-form="quote-changes"]')!;
  fill(changes, { reason: 'Please change the maintenance deliverables' });
  await submit(changes);
  assert.equal(
    (await call(f.sales, 'GET', `/v1/quotes/${quotes[0]!.id}`, 'client')).body.status,
    'changes_requested',
  );
  await review(f.root, quotes[1]!.id);
  const reject = f.root.querySelector<HTMLFormElement>('[data-live-form="quote-reject"]')!;
  fill(reject, { reason: 'The implementation dates do not fit our plan' });
  await submit(reject);
  assert.equal(
    (await call(f.sales, 'GET', `/v1/quotes/${quotes[1]!.id}`, 'client')).body.status,
    'rejected',
  );
  await review(f.root, quotes[2]!.id);
  const stale = f.root.querySelector<HTMLFormElement>('[data-live-form="quote-accept"]')!;
  await call(f.sales, 'POST', `/v1/quotes/${quotes[2]!.id}/reject`, 'client', {
    expectedVersion: quotes[2]!.version,
    reason: 'Decision from another device',
  });
  fill(stale, { consent: true });
  await submit(stale);
  assert.match(f.root.querySelector('#live-notice')?.textContent ?? '', /تغير السجل/);
  assert.equal(
    (await call(f.sales, 'GET', `/v1/quotes/${quotes[2]!.id}`, 'client')).body.status,
    'rejected',
  );
  assert.equal((await call(f.sales, 'GET', '/v1/contracts', 'client')).body.items.length, 0);
});

test('disposing the workspace removes stale handlers and a late response cannot render another account data', async () => {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://web.staging.example/' });
  const root = dom.window.document.querySelector<HTMLElement>('#app')!;
  const controller = new AbortController();
  let resolveIdentity!: (value: Response) => void;
  let requestSignal: AbortSignal | null | undefined;
  const mount = mountLiveWorkspace({
    root,
    role: 'client',
    baseUrl: 'https://gateway.example',
    accessToken: async () => 'old-account',
    signal: controller.signal,
    fetch: async (_url, init) => {
      requestSignal = init?.signal;
      return new Promise<Response>((resolve) => {
        resolveIdentity = resolve;
      });
    },
  });
  await until(() => Boolean(resolveIdentity), 'Identity request did not start');
  controller.abort();
  assert.equal(requestSignal?.aborted, true);
  root.textContent = 'New account shell';
  resolveIdentity(
    Response.json({ principal: { roles: ['client'], sub: 'old-account', tenantId: 'old-tenant' } }),
  );
  const dispose = await mount;
  assert.equal(root.textContent, 'New account shell');
  dispose();
  assert.equal(root.textContent, 'New account shell');
  dom.window.close();
});

test('admin rejection records its reason, keeps the quote unsent and renders supplied terms as text', async (t) => {
  const f = await fixture(t);
  await f.publish();
  const visit = await f.start();
  const draft = (
    await call(f.sales, 'POST', '/v1/quotes', 'rep', {
      ...f.quoteInput(visit.id, 2000),
      terms: 'Review <img src=x onerror=alert(1)> safely before deciding',
    })
  ).body;
  const approval = (
    await call(f.sales, 'POST', `/v1/quotes/${draft.id}/discount-approval`, 'rep', {
      expectedVersion: draft.version,
      reason: 'Commercial exception request for review',
    })
  ).body;
  await f.mount('admin');
  await review(f.root, approval.id);
  assert.equal(f.root.querySelector('img'), null);
  assert.match(f.root.textContent ?? '', /<img src=x onerror=alert\(1\)>/);
  const form = f.root.querySelector<HTMLFormElement>('[data-live-form="discount-decision"]')!;
  fill(form, {
    decision: 'rejected',
    note: 'The proposed commercial margin is insufficient',
    consent: true,
  });
  await submit(form);
  const stored = (await call(f.sales, 'GET', '/v1/quote-discount-approvals', 'admin')).body
    .items[0];
  assert.equal(stored.status, 'rejected');
  assert.equal(stored.decisionNote, 'The proposed commercial margin is insufficient');
  assert.equal(
    (
      await call(f.sales, 'POST', `/v1/quotes/${draft.id}/send`, 'rep', {
        expectedVersion: draft.version,
      })
    ).status,
    409,
  );
});

test('incomplete financial detail never exposes a client consent form', async () => {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://web.staging.example/' });
  const root = dom.window.document.querySelector<HTMLElement>('#app')!;
  let mutations = 0;
  const cleanup = await mountLiveWorkspace({
    root,
    role: 'client',
    baseUrl: 'https://gateway.example',
    accessToken: async () => 'client',
    fetch: async (url, init) => {
      if (init?.method !== 'GET') mutations++;
      const path = new URL(String(url)).pathname;
      if (path === '/v1/identity/me')
        return Response.json({
          principal: { sub: 'client', tenantId: 'tenant', roles: ['client'] },
          profile: null,
        });
      if (path === '/v1/billing/invoices') return Response.json({ items: [] });
      if (path === '/v1/sales/quotes')
        return Response.json({ items: [{ id: 'quote-1', version: 1, status: 'sent' }] });
      if (path === '/v1/sales/quotes/quote-1')
        return Response.json({
          id: 'quote-1',
          version: 1,
          status: 'sent',
          terms: 'Missing the actual price and installments',
        });
      throw new Error('Unexpected path');
    },
  });
  try {
    await section(root, 'quotes');
    await review(root, 'quote-1');
    assert.equal(root.querySelector('[data-live-form="quote-accept"]'), null);
    assert.match(root.textContent ?? '', /لم تصل تفاصيل كاملة/);
    assert.equal(mutations, 0);
  } finally {
    cleanup();
    dom.window.close();
  }
});
