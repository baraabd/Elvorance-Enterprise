/** Test-only transport: real workspace renderers, no external API or user account. */
import { mountLiveWorkspace } from '../../packages/api-client/src/live-workspace.ts';
import { createRepApi, resourcePaths } from '../../apps/rep-mobile/src/server/api.ts';
import { mountRepWorkspace } from '../../apps/rep-mobile/src/server/workspace.ts';
import { installEnterpriseUx } from '../../packages/ui/src/enterprise-ux.ts';
import type { MobileAuth } from '../../packages/mobile-auth/src/index.ts';

type Role = 'admin' | 'client' | 'rep' | 'rep-compat';
type Scenario = 'records' | 'empty' | 'error' | 'slow';
const entity = (id: string, fields: Record<string, unknown>) => ({
  id,
  version: 1,
  tenantId: 'ux-fixture-tenant',
  createdAt: '2027-02-10T09:00:00Z',
  updatedAt: '2027-02-10T09:00:00Z',
  ...fields,
});
const customer = entity('customer-1', {
  name: 'مؤسسة Atlas 123',
  contactName: 'سارة',
  repId: 'rep-1',
  regionId: 'region-1',
  phone: '+966 555 123 456',
  email: 'contact@example.test',
  status: 'qualified',
  doNotContact: false,
  consentVersion: 1,
  notes: 'بيانات اختبار الواجهة فقط',
});
const data: Record<string, unknown[]> = {
  customers: [customer],
  regions: [entity('region-1', { name: 'المنطقة الأولى', code: 'A-01', active: true })],
  visits: [
    entity('visit-1', {
      clientId: 'customer-1',
      customerName: 'مؤسسة Atlas 123',
      repId: 'rep-1',
      status: 'scheduled',
      scheduledAt: '2027-02-10T13:00:00Z',
      purpose: 'مراجعة الخدمات',
    }),
  ],
  opportunities: [
    entity('opportunity-1', {
      clientId: 'customer-1',
      customerName: 'مؤسسة Atlas 123',
      title: 'تطوير الموقع',
      stage: 'qualified',
      amountMinor: 120000,
      currency: 'SAR',
    }),
  ],
  tasks: [
    entity('task-1', {
      title: 'إعداد المقترح',
      status: 'open',
      dueOn: '2027-02-12',
      priority: 'medium',
    }),
  ],
  routes: [
    entity('route-1', { title: 'زيارات الأربعاء', status: 'planned', visitIds: ['visit-1'] }),
  ],
  quotes: [
    entity('quote-1', {
      clientId: 'customer-1',
      customerName: 'مؤسسة Atlas 123',
      status: 'draft',
      currency: 'SAR',
      subtotalMinor: 120000,
      discountMinor: 0,
      totalMinor: 120000,
      validUntil: '2027-02-20',
      terms: 'شروط العرض للاختبار',
      items: [
        { serviceId: 'service-1', title: 'تطوير الموقع', quantity: 1, unitPriceMinor: 120000 },
      ],
      paymentPlan: [
        { id: 'payment-1', label: 'عند الاعتماد', amountMinor: 120000, dueOn: '2027-02-20' },
      ],
    }),
  ],
  contracts: [
    entity('contract-1', {
      customerName: 'مؤسسة Atlas 123',
      status: 'draft',
      title: 'عقد تطوير الموقع',
      terms: 'شروط اختبار العرض',
      totalMinor: 120000,
      currency: 'SAR',
    }),
  ],
  projects: [
    entity('project-1', {
      title: 'تطوير الموقع',
      status: 'active',
      progress: 25,
      dueOn: '2027-03-01',
    }),
  ],
  invoices: [
    entity('invoice-1', {
      label: 'الفاتورة INV-2027-001',
      status: 'open',
      amountMinor: 120000,
      paidMinor: 0,
      currency: 'SAR',
      dueOn: '2027-02-20',
    }),
  ],
  tickets: [
    entity('ticket-1', {
      subject: 'طلب مساعدة',
      status: 'open',
      category: 'general',
      message: 'سؤال اختبار الواجهة',
    }),
  ],
  notifications: [
    entity('notification-1', { title: 'تحديث المشروع', body: 'تحديث تجريبي', read: false }),
  ],
  conversations: [entity('conversation-1', { customerName: 'مؤسسة Atlas 123' })],
  memberships: [
    entity('membership-1', { displayName: 'مندوب الاختبار', roles: ['rep'], active: true }),
  ],
  'quote-discount-approvals': [],
};
const knownLists = new Set([
  ...Object.values(resourcePaths),
  '/v1/identity/memberships',
  '/v1/sales/quote-discount-approvals',
]);
let role: Role = 'admin';
let scenario: Scenario = 'records';
let cleanup: (() => void | Promise<void>) | undefined;
let abort: AbortController | undefined;
let disposeUx: (() => void) | undefined;
const calls: Array<{ path: string; method: string; idempotencyKey: string | null }> = [];
let customerWrite: 'reject' | 'fail' | 'succeed' = 'reject';
const unexpectedRequests: string[] = [];
const fixtureFetch: typeof fetch = async (input, init) => {
  const path = new URL(String(input)).pathname;
  const method = init?.method ?? 'GET';
  calls.push({ path, method, idempotencyKey: new Headers(init?.headers).get('Idempotency-Key') });
  if (method === 'POST' && path === '/v1/crm/customers' && customerWrite !== 'reject') {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (customerWrite === 'fail')
      return Response.json(
        {
          error: {
            code: 'service_unavailable',
            message: 'فشل اختبار الحفظ؛ لم يتصل الاختبار بأي خادم حقيقي.',
          },
        },
        { status: 503 },
      );
    const created = entity(
      'customer-fixture-created',
      JSON.parse(String(init?.body)) as Record<string, unknown>,
    );
    data.customers?.push(created);
    return Response.json(created, { status: 201 });
  }
  if (method !== 'GET') {
    unexpectedRequests.push(method + ' ' + path);
    throw new Error('UX fixture transport refuses unplanned writes.');
  }
  if (path === '/v1/identity/me')
    return Response.json({
      principal: {
        sub: 'ux-fixture-user',
        tenantId: 'ux-fixture-tenant',
        roles: [role === 'rep-compat' ? 'rep' : role],
        repId: 'rep-1',
        clientId: 'customer-1',
      },
      profile: entity('profile-1', {
        displayName: 'مندوب الاختبار',
        phone: '+966555123456',
        locale: 'ar',
        timeZone: 'UTC',
      }),
      profileVersion: 1,
      identitySource: 'TEST_FIXTURE_NOT_OIDC',
    });
  if (scenario === 'slow') await new Promise((resolve) => setTimeout(resolve, 800));
  if (scenario === 'error')
    return Response.json(
      { error: { code: 'service_unavailable', message: 'Fixture failure' } },
      { status: 503 },
    );
  if (path === '/v1/tracking/sessions/current') return Response.json({ items: [] });
  if (path === '/v1/crm/catalog')
    return Response.json({
      configured: true,
      currency: 'SAR',
      version: 1,
      items:
        scenario === 'empty'
          ? []
          : [
              {
                id: 'service-1',
                title: 'تطوير الموقع',
                short: 'خدمة اختبار الواجهة',
                duration: 'أربعة أسابيع',
                unitPriceMinor: 120000,
                deliverables: ['واجهة متجاوبة'],
              },
            ],
    });
  if (knownLists.has(path))
    return Response.json({
      items: scenario === 'empty' ? [] : (data[path.split('/').at(-1) ?? ''] ?? []),
      nextCursor: null,
    });
  unexpectedRequests.push(path);
  throw new Error('Unexpected UX fixture request: ' + path);
};
const root = document.getElementById('app');
if (!root) throw new Error('Fixture app root is missing.');
const harness = {
  calls,
  unexpectedRequests,
  async start(nextRole: Role, nextScenario: Scenario = 'records') {
    abort?.abort();
    await cleanup?.();
    disposeUx?.();
    calls.length = 0;
    unexpectedRequests.length = 0;
    role = nextRole;
    scenario = nextScenario;
    root.replaceChildren();
    abort = new AbortController();
    disposeUx = installEnterpriseUx(root, { mode: 'server' });
    if (role === 'rep') {
      const api = createRepApi({
        baseUrl: 'https://ux-fixture.invalid',
        accessToken: async () => 'test-fixture-not-a-real-token',
        fetch: fixtureFetch,
      });
      const auth = { signOut: async () => ({ revoked: true }) } as unknown as MobileAuth;
      cleanup = await mountRepWorkspace(root, api, auth, 'staging', abort.signal);
    } else
      cleanup = await mountLiveWorkspace({
        root,
        role: role === 'rep-compat' ? 'rep' : role,
        baseUrl: 'https://ux-fixture.invalid',
        accessToken: async () => 'test-fixture-not-a-real-token',
        fetch: fixtureFetch,
        signal: abort.signal,
      });
  },
  allowCustomerWrite(value: 'fail' | 'succeed') {
    customerWrite = value;
  },
  setScenario(value: Scenario) {
    scenario = value;
  },
};
Object.assign(window, { uxHarness: harness });
