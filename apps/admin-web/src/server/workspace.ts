import { ApiError } from '@elvorance/api-client';
import type { LiveWorkspaceOptions } from '@elvorance/api-client/live-workspace';
import type { CatalogSnapshot } from '@elvorance/contracts';
import {
  createAdminApi,
  errorText,
  object,
  paths,
  segment,
  type Resource,
  type Row,
} from './api.ts';
import { button, el, fields, label } from './forms.ts';
import {
  createOperation,
  nestedProjectOperations,
  recordOperations,
  titles,
  type Operation,
} from './operations.ts';
import { snapshot } from './reports.ts';
import { quoteOperation } from './quote-editor.ts';

const extraTitles = {
  dashboard: 'لوحة المؤشرات',
  catalog: 'الكتالوج والاستبيان',
  reports: 'التقارير التشغيلية',
  settings: 'إعدادات المؤسسة',
  roles: 'الأدوار والصلاحيات',
  audit: 'سجلات التدقيق',
} as const;
type Screen = Resource | keyof typeof extraTitles;
const screenTitles: Record<Screen, string> = { ...extraTitles, ...titles };
/** Actual route targets, including the previous live-workspace membership link. */
export const adminRouteTargets = {
  dashboard: 'dashboard',
  catalog: 'catalog',
  reports: 'reports',
  settings: 'settings',
  roles: 'roles',
  audit: 'audit',
  customers: 'customers',
  users: 'users',
  representatives: 'representatives',
  regions: 'regions',
  visits: 'visits',
  tasks: 'tasks',
  opportunities: 'opportunities',
  routes: 'routes',
  quotes: 'quotes',
  approvals: 'approvals',
  contracts: 'contracts',
  projects: 'projects',
  invoices: 'invoices',
  tickets: 'tickets',
  conversations: 'conversations',
  notifications: 'notifications',
  memberships: 'users',
} as const satisfies Record<string, Screen>;
const detailEndpoints = new Set<Resource>([
  'customers',
  'visits',
  'tasks',
  'opportunities',
  'routes',
  'quotes',
  'contracts',
  'projects',
  'invoices',
  'tickets',
]);
const displayNames: Record<string, string> = {
  id: 'المعرّف',
  name: 'الاسم',
  title: 'العنوان',
  subject: 'الموضوع',
  displayName: 'اسم العرض',
  status: 'الحالة',
  stage: 'المرحلة',
  repId: 'المندوب',
  clientId: 'العميل',
  customerName: 'اسم العميل',
  phone: 'الهاتف',
  email: 'البريد',
  version: 'الإصدار',
  createdAt: 'تاريخ الإنشاء',
  updatedAt: 'آخر تحديث',
  amountMinor: 'قيمة الفاتورة بأصغر وحدة',
  paidMinor: 'المحصّل بأصغر وحدة',
  totalMinor: 'الإجمالي بأصغر وحدة',
  currency: 'العملة',
  purpose: 'الغرض',
  scheduledAt: 'الموعد',
  dueOn: 'الاستحقاق',
  notes: 'ملاحظات',
  terms: 'الشروط',
  milestones: 'المراحل',
  deliverables: 'المخرجات',
  items: 'البنود',
  paymentPlan: 'الدفعات',
  messages: 'الرسائل',
  body: 'النص',
  roles: 'الأدوار الوصفية',
  doNotContact: 'عدم التواصل',
  progress: 'التقدم',
};
export function parseRoute(hash: string): {
  screen: Screen;
  id: string | null;
  query: URLSearchParams;
} {
  const [path, search = ''] = hash.replace(/^#\/?admin\/?/, '').split('?');
  const [name = 'dashboard', id] = (path || 'dashboard').split('/');
  return {
    screen: Object.hasOwn(adminRouteTargets, name)
      ? adminRouteTargets[name as keyof typeof adminRouteTargets]
      : 'dashboard',
    id: id || null,
    query: new URLSearchParams(search),
  };
}
export function selectRows(rows: Row[], query: URLSearchParams): Row[] {
  const term = (query.get('q') ?? '').trim().toLocaleLowerCase('ar');
  const state = query.get('status') ?? '';
  const keys = [
    'id',
    'name',
    'title',
    'subject',
    'displayName',
    'customerName',
    'repId',
    'phone',
    'email',
  ];
  return rows
    .filter(
      (row) =>
        (!state || String(row.status ?? row.stage ?? '') === state) &&
        (!term ||
          keys.some((key) =>
            String(row[key] ?? '')
              .toLocaleLowerCase('ar')
              .includes(term),
          )),
    )
    .sort((a, b) => {
      const key = query.get('sort') === 'updatedAt' ? 'updatedAt' : 'name';
      const get = (row: Row) =>
        String(
          key === 'name'
            ? (row.name ?? row.title ?? row.displayName ?? row.subject ?? row.id)
            : (row[key] ?? ''),
        );
      return (
        get(a).localeCompare(get(b), 'ar', { numeric: true }) *
        (query.get('order') === 'desc' ? -1 : 1)
      );
    });
}
export async function mountAdminWorkspace(options: LiveWorkspaceOptions): Promise<() => void> {
  const { root } = options;
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (!view) throw new Error('تعذّر فتح نافذة الإدارة.');
  const win = view;
  const lifetime = new AbortController();
  const outerAbort = () => lifetime.abort();
  options.signal?.addEventListener('abort', outerAbort, { once: true });
  if (options.signal?.aborted) lifetime.abort();
  const api = createAdminApi(
    {
      baseUrl: options.baseUrl,
      accessToken: options.accessToken,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    },
    lifetime.signal,
  );
  let request = new AbortController();
  let generation = 0;
  let saving = false;
  let disposed = false;
  const mountId = crypto.randomUUID();
  root.dataset.adminMount = mountId;
  root.dir = 'rtl';
  root.lang = 'ar';
  root.classList.add('admin-server');
  const nav = el(doc, 'nav');
  nav.setAttribute('aria-label', 'أقسام الإدارة');
  const content = el(doc, 'main');
  content.id = `admin-content-${mountId}`;
  content.tabIndex = -1;
  const notice = el(doc, 'p');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  const skip = el(doc, 'a', 'انتقل إلى المحتوى');
  skip.className = 'admin-skip';
  skip.href = `#${content.id}`;
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    content.focus();
  });
  const shell = el(doc, 'div');
  shell.className = 'admin-shell';
  shell.append(nav, content);
  root.replaceChildren(skip, el(doc, 'h1', 'إلفورانس — إدارة المؤسسة'), notice, shell);
  const cursors = new Map<Resource, (string | null)[]>();
  const next = new Map<Resource, string | null>();
  const active = () => !disposed && !lifetime.signal.aborted && root.dataset.adminMount === mountId;
  const go = (screen: Screen, id?: string, query = '') => {
    if (saving) {
      notice.textContent = 'انتظر تأكيد نتيجة العملية قبل تغيير الصفحة.';
      return;
    }
    const hash = `#/admin/${screen}${id ? '/' + id : ''}${query ? '?' + query : ''}`;
    if (win.location.hash === hash) void render();
    else win.location.hash = hash;
  };
  function showError(error: unknown, retry: () => void) {
    const panel = el(doc, 'section');
    panel.setAttribute('role', 'alert');
    panel.append(
      el(doc, 'h2', 'تعذّر تحميل البيانات'),
      el(doc, 'p', errorText(error)),
      button(doc, 'إعادة المحاولة', retry),
    );
    content.replaceChildren(panel);
  }
  function showObject(value: Record<string, unknown>): HTMLElement {
    const dl = el(doc, 'dl');
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'tenantId') continue;
      dl.append(el(doc, 'dt', displayNames[key] ?? key));
      const dd = el(doc, 'dd');
      if (entry && typeof entry === 'object') {
        const details = el(doc, 'details');
        details.append(el(doc, 'summary', 'عرض التفاصيل'));
        const pre = el(doc, 'pre', JSON.stringify(entry, null, 2));
        pre.dir = 'auto';
        details.append(pre);
        dd.append(details);
      } else {
        dd.textContent = label(entry);
        dd.dir = 'auto';
      }
      dl.append(dd);
    }
    return dl;
  }
  async function showForm(operation: Operation, record?: Row, initial?: Record<string, unknown>) {
    const form = el(doc, 'form');
    form.dataset.adminForm = operation.id;
    form.append(el(doc, 'h2', operation.label));
    if (operation.notice) form.append(el(doc, 'p', operation.notice));
    const editor = fields(doc, operation.fields, initial ?? record ?? {});
    form.append(editor.root);
    const confirm = el(doc, 'label', 'أؤكد مراجعة البيانات وتنفيذ العملية على الخادم.');
    const check = el(doc, 'input');
    check.type = 'checkbox';
    check.required = true;
    check.name = '_confirmation';
    confirm.append(check);
    form.append(confirm);
    const status = el(doc, 'p');
    status.setAttribute('role', 'alert');
    form.append(status);
    const submit = el(doc, 'button', 'تأكيد وحفظ');
    submit.type = 'submit';
    form.append(
      submit,
      button(doc, 'إلغاء', () => void render()),
    );
    const token = generation;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (saving || !form.reportValidity()) return;
      let body: Record<string, unknown>;
      try {
        body = editor.read();
        if (operation.prepare) body = operation.prepare(body);
        if (operation.versioned) {
          if (!record) throw new Error('أعد قراءة السجل أولًا.');
          body.expectedVersion = record.version;
        }
      } catch (error) {
        status.textContent = errorText(error);
        return;
      }
      saving = true;
      form.setAttribute('aria-busy', 'true');
      submit.disabled = true;
      const controls = Array.from(
        form.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
        >('input,textarea,select,button'),
      );
      controls.forEach((control) => {
        control.disabled = true;
      });
      status.textContent = 'جارٍ حفظ البيانات…';
      void api
        .mutate(operation.method, operation.path, body)
        .then(async () => {
          if (!active()) return;
          saving = false;
          notice.textContent = 'أكد الخادم نجاح العملية. تُقرأ البيانات المحدثة الآن.';
          if (token === generation) {
            const route = parseRoute(win.location.hash);
            if (route.id === 'new') go(route.screen);
            else await render();
          }
        })
        .catch((error: unknown) => {
          if (active() && token === generation) status.textContent = errorText(error);
        })
        .finally(() => {
          saving = false;
          form.setAttribute('aria-busy', 'false');
          controls.forEach((control) => {
            control.disabled = false;
          });
        });
    });
    content.replaceChildren(form);
    (form.querySelector('input,textarea,select') as HTMLElement | null)?.focus();
  }
  async function list(
    resource: Resource,
    query: URLSearchParams,
    signal: AbortSignal,
    token: number,
  ) {
    const stack = cursors.get(resource) ?? [null];
    cursors.set(resource, stack);
    const global = query.get('scope') === 'all';
    const page = global
      ? { items: await api.all(resource, signal), nextCursor: null }
      : await api.page(resource, stack.at(-1) ?? null, signal);
    if (!active() || token !== generation) return;
    next.set(resource, page.nextCursor);
    const rows =
      resource === 'representatives'
        ? page.items.filter((row) => Array.isArray(row.roles) && row.roles.includes('rep'))
        : page.items;
    const heading = el(doc, 'h2', titles[resource]);
    const tools = el(doc, 'div');
    tools.className = 'admin-toolbar';
    const create = createOperation(resource);
    if (create) tools.append(button(doc, create.label, () => go(resource, 'new')));
    if (resource === 'quotes')
      tools.append(button(doc, 'إضافة عرض سعر', () => go(resource, 'new')));
    tools.append(
      button(doc, 'تحديث من الخادم', () => {
        cursors.delete(resource);
        void render();
      }),
    );
    const filter = el(doc, 'form');
    filter.className = 'admin-toolbar';
    const queryFields = fields(
      doc,
      [
        { key: 'q', label: 'البحث' },
        {
          key: 'scope',
          label: 'نطاق القراءة',
          type: 'select',
          choices: ['page', 'all'],
          default: 'page',
        },
        {
          key: 'status',
          label: 'الحالة / المرحلة',
          type: 'select',
          choices: [
            '',
            ...new Set(rows.map((row) => String(row.status ?? row.stage ?? '')).filter(Boolean)),
          ],
        },
        { key: 'sort', label: 'الفرز', type: 'select', choices: ['name', 'updatedAt'] },
        { key: 'order', label: 'الترتيب', type: 'select', choices: ['asc', 'desc'] },
      ],
      {
        scope: global ? 'all' : 'page',
        q: query.get('q') ?? '',
        status: query.get('status') ?? '',
        sort: query.get('sort') ?? 'name',
        order: query.get('order') ?? 'asc',
      },
    );
    filter.append(queryFields.root);
    const apply = el(doc, 'button', 'تطبيق البحث والتصفية');
    apply.type = 'submit';
    filter.append(apply);
    filter.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = queryFields.read();
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(values)) if (value) params.set(key, String(value));
      go(resource, undefined, params.toString());
    });
    const matching = selectRows(rows, query);
    const requested = Number(query.get('page') ?? '1');
    const currentPage =
      global && Number.isSafeInteger(requested)
        ? Math.max(1, Math.min(requested, Math.max(1, Math.ceil(matching.length / 100))))
        : 1;
    const visible = global ? matching.slice((currentPage - 1) * 100, currentPage * 100) : matching;
    const holder = el(doc, 'div');
    holder.className = 'admin-table-scroll';
    holder.tabIndex = 0;
    holder.setAttribute('role', 'region');
    holder.setAttribute('aria-label', `جدول ${titles[resource]}`);
    const table = el(doc, 'table');
    table.append(
      el(
        doc,
        'caption',
        `${titles[resource]} — الصفحة ${global ? currentPage : stack.length}، ${visible.length} سجل ظاهر${global ? ' / ' + matching.length + ' مطابق' : ''}`,
      ),
    );
    const header = el(doc, 'tr');
    for (const title of ['السجل', 'الحالة / المرحلة', 'الإصدار', 'العمليات']) {
      const cell = el(doc, 'th', title);
      cell.scope = 'col';
      header.append(cell);
    }
    const thead = el(doc, 'thead');
    thead.append(header);
    table.append(thead);
    const body = el(doc, 'tbody');
    for (const row of visible) {
      const tr = el(doc, 'tr');
      const cell = el(
        doc,
        'td',
        String(
          row.name ?? row.title ?? row.displayName ?? row.subject ?? row.customerName ?? row.id,
        ),
      );
      cell.dir = 'auto';
      tr.append(
        cell,
        el(doc, 'td', label(row.status ?? row.stage)),
        el(doc, 'td', String(row.version)),
      );
      const actions = el(doc, 'td');
      actions.append(button(doc, 'فتح السجل', () => go(resource, row.id)));
      tr.append(actions);
      body.append(tr);
    }
    table.append(body);
    holder.append(table);
    const pages = el(doc, 'div');
    pages.className = 'admin-toolbar';
    const globalPage = (number: number) => {
      const params = new URLSearchParams(query);
      params.set('page', String(number));
      go(resource, undefined, params.toString());
    };
    const prev = button(doc, 'الصفحة السابقة', () => {
      if (global) {
        globalPage(currentPage - 1);
        return;
      }
      stack.pop();
      void render();
    });
    prev.disabled = global ? currentPage === 1 : stack.length === 1;
    const forward = button(doc, 'الصفحة التالية', () => {
      if (global) {
        globalPage(currentPage + 1);
        return;
      }
      const cursor = next.get(resource);
      if (!cursor) return;
      if (stack.includes(cursor)) {
        showError(new Error('تكرر مؤشر الصفحة؛ أعد التحديث.'), () => {
          cursors.delete(resource);
          void render();
        });
        return;
      }
      stack.push(cursor);
      void render();
    });
    forward.disabled = global ? currentPage * 100 >= matching.length : !page.nextCursor;
    pages.append(prev, forward);
    content.replaceChildren(
      heading,
      tools,
      el(
        doc,
        'p',
        'اختر القراءة الشاملة للبحث والتصفية والفرز عبر جميع الصفحات (حد أقصى 10,000 سجل). لا تُعرض نتائج جزئية عند تجاوز الحد. القراءة المتتابعة ليست لقطة ذرية؛ للتوسع يلزم بحث وتجميع من الخادم.',
      ),
      filter,
      holder,
      pages,
    );
    if (!visible.length)
      holder.prepend(
        el(
          doc,
          'p',
          page.items.length
            ? 'لا توجد نتائج مطابقة في هذه الصفحة.'
            : 'لا توجد سجلات في هذه الصفحة.',
        ),
      );
    if (resource === 'users' || resource === 'representatives')
      content.append(
        el(
          doc,
          'p',
          'هذه ملفات عضوية وصفية. لا تثبت منح صلاحيات الدخول ولا توفر تعطيل الحساب أو إعادة ضبطه.',
        ),
      );
  }
  async function detail(resource: Resource, id: string, signal: AbortSignal, token: number) {
    segment(id);
    let value: Row;
    if (detailEndpoints.has(resource)) value = await api.detail(resource, id, signal);
    else {
      const found = (await api.all(resource, signal)).find((row) => row.id === id);
      if (!found) throw new ApiError(404, 'not_found', 'السجل غير موجود.');
      value = found;
    }
    let auxiliary: Record<string, unknown> | null = null;
    if (resource === 'contracts')
      auxiliary = object(await api.get(`${paths.contracts}/${id}/fulfillment`, signal));
    if (resource === 'invoices')
      auxiliary = await api.related(`${paths.invoices}/${id}/payments`, signal);
    if (resource === 'approvals' && typeof value.quoteId === 'string')
      auxiliary = await api.detail('quotes', value.quoteId, signal);
    if (resource === 'conversations') {
      auxiliary = await api.related(`${paths.conversations}/${id}/messages`, signal);
      const current = object(auxiliary.conversation);
      if (current.id !== value.id) throw new Error('محادثة غير مطابقة.');
      value = { ...value, ...current };
    }
    if (!active() || token !== generation) return;
    const actions = el(doc, 'div');
    actions.className = 'admin-toolbar';
    actions.append(
      button(doc, 'العودة إلى القائمة', () => go(resource)),
      button(doc, 'تحديث السجل', () => void render()),
    );
    for (const operation of [
      ...recordOperations(resource, value),
      ...(resource === 'projects' ? nestedProjectOperations(value) : []),
    ])
      actions.append(button(doc, operation.label, () => void showForm(operation, value)));
    if (resource === 'quotes' && value.status === 'draft')
      actions.append(
        button(doc, 'تعديل مسودة العرض', () => {
          void api
            .get<CatalogSnapshot>('/v1/crm/catalog', signal)
            .then((catalog) => {
              if (active() && token === generation)
                void showForm(quoteOperation(catalog, value), value);
            })
            .catch((error) => {
              notice.textContent = errorText(error);
            });
        }),
      );
    content.replaceChildren(el(doc, 'h2', titles[resource]), actions, showObject(value));
    if (auxiliary) {
      content.append(el(doc, 'h3', 'تفاصيل مرتبطة من الخدمة'), showObject(auxiliary));
      if (
        resource === 'conversations' &&
        Array.isArray(auxiliary.items) &&
        auxiliary.items.length
      ) {
        const last = object(auxiliary.items.at(-1));
        actions.append(
          button(
            doc,
            'تأكيد قراءة الرسائل',
            () =>
              void showForm(
                {
                  id: 'read',
                  label: 'تأكيد قراءة الرسائل',
                  method: 'POST',
                  path: `${paths.conversations}/${id}/read`,
                  fields: [],
                  versioned: true,
                  prepare: () => ({ lastMessageId: last.id }),
                },
                value,
              ),
          ),
        );
      }
    }
  }
  async function dashboard(signal: AbortSignal, token: number) {
    const data = await snapshot(api, signal);
    if (!active() || token !== generation) return;
    const cards = el(doc, 'div');
    cards.className = 'admin-cards';
    for (const metric of data.metrics) {
      const card = el(doc, 'section');
      card.append(
        el(doc, 'h3', titles[metric.resource]),
        el(doc, 'p', new Intl.NumberFormat('ar').format(metric.count)),
        button(doc, 'عرض السجلات', () => go(metric.resource)),
      );
      for (const [state, count] of Object.entries(metric.states))
        card.append(
          button(doc, `${label(state)}: ${count}`, () =>
            go(
              metric.resource,
              undefined,
              new URLSearchParams({ status: state, scope: 'all' }).toString(),
            ),
          ),
        );
      cards.append(card);
    }
    content.replaceChildren(
      el(doc, 'h2', 'مؤشرات تشغيلية من API'),
      button(doc, 'تحديث المؤشرات', () => void render()),
      el(
        doc,
        'p',
        `اكتملت القراءة: ${data.capturedAt}. قراءة متتابعة وليست لقطة محاسبية ذرية. حد التقرير 10,000 سجل لكل نطاق؛ يتوقف الحساب عند تجاوزه.`,
      ),
      cards,
    );
    for (const [currency, total] of Object.entries(data.invoices))
      content.append(el(doc, 'h3', currency), showObject(total));
    content.append(
      el(
        doc,
        'p',
        'المبالغ بأصغر وحدة نقدية، منفصلة حسب العملة. لا تمثل قيمة الفواتير إيرادًا محاسبيًا معترفًا به. تفاصيل الحالة تستخدم قراءة شاملة محدودة بالسقف نفسه؛ قد تتغير الأرقام إن عدّل مستخدم آخر البيانات بين القراءتين.',
      ),
    );
  }
  async function special(screen: Screen, signal: AbortSignal, token: number) {
    if (screen === 'dashboard' || screen === 'reports') return dashboard(signal, token);
    if (screen === 'catalog') {
      const config = object(await api.get('/v1/crm/configuration', signal));
      const catalog = await api.get<CatalogSnapshot>('/v1/crm/catalog', signal);
      if (!active() || token !== generation) return;
      const operation: Operation = {
        id: 'configuration',
        label: 'نشر كتالوج واستبيان المؤسسة',
        method: 'PUT',
        path: '/v1/crm/configuration',
        fields: [
          { key: 'currency', label: 'العملة (ثلاثة أحرف)', required: true, min: 3, max: 3 },
          {
            key: 'catalog',
            label: 'خدمات المؤسسة الفعلية',
            type: 'rows',
            max: 250,
            fields: [
              { key: 'id', label: 'معرّف الخدمة', required: true, min: 2, max: 60 },
              { key: 'title', label: 'اسم الخدمة', required: true, min: 2, max: 150 },
              { key: 'category', label: 'رمز الفئة', required: true, min: 2, max: 60 },
              {
                key: 'price',
                label: 'السعر بالوحدة النقدية الرئيسية',
                type: 'number',
                step: '0.01',
                min: 0,
                max: 100000000,
                required: true,
              },
              { key: 'active', label: 'خدمة فعالة', type: 'checkbox', default: true },
              { key: 'short', label: 'الوصف', max: 300 },
              { key: 'duration', label: 'المدة', max: 100 },
              { key: 'unit', label: 'الوحدة', max: 100 },
              { key: 'features', label: 'المزايا، كل ميزة في سطر', type: 'lines' },
              { key: 'deliverables', label: 'المخرجات، كل مخرج في سطر', type: 'lines' },
              { key: 'recommendationTags', label: 'وسوم التوصية، كل وسم في سطر', type: 'lines' },
            ],
          },
          {
            key: 'definition',
            label: 'تعريف الاستبيان JSON — محرر متقدم، وليس مصمم استبيان مرئيًا',
            type: 'json',
            required: true,
          },
        ],
        notice:
          config.source === 'default'
            ? 'لم تُنشر بيانات المؤسسة. تعريف الاستبيان قالب يحتاج مراجعة؛ لا تُستعمل أسعار المثال.'
            : 'سيُحفظ إصدار جديد بعد تحقق الخادم من الكتالوج وتعريف الاستبيان.',
        prepare: (input) => ({ ...input, expectedVersion: config.recordVersion }),
      };
      content.replaceChildren(
        el(doc, 'h2', 'الكتالوج المنشور'),
        showObject(catalog as unknown as Record<string, unknown>),
        button(
          doc,
          'تحرير ونشر',
          () =>
            void showForm(operation, undefined, {
              ...config,
              catalog: config.source === 'tenant' ? config.catalog : [],
            }),
        ),
      );
      return;
    }
    if (screen === 'settings') {
      const data = object(await api.get('/v1/identity/tenant', signal));
      if (!active() || token !== generation) return;
      content.replaceChildren(el(doc, 'h2', 'ملف المؤسسة'), showObject(data));
      if (data.tenant == null)
        content.append(
          button(
            doc,
            'إنشاء ملف المؤسسة',
            () =>
              void showForm({
                id: 'tenant',
                label: 'إنشاء ملف المؤسسة',
                method: 'POST',
                path: '/v1/identity/tenant',
                fields: [
                  { key: 'name', label: 'اسم المؤسسة', min: 2, max: 150, required: true },
                  {
                    key: 'locale',
                    label: 'اللغة',
                    type: 'select',
                    choices: ['ar', 'en'],
                    default: 'ar',
                    required: true,
                  },
                  { key: 'currency', label: 'العملة', min: 3, max: 3, required: true },
                ],
              }),
          ),
        );
      content.append(el(doc, 'p', 'تعديل الملف وإعدادات الأمان غير متاحين في العقد الحالي.'));
      return;
    }
    content.replaceChildren(el(doc, 'h2', screenTitles[screen]));
    content.append(
      el(
        doc,
        'p',
        screen === 'roles'
          ? 'تُفرض الصلاحيات الفعلية في Backend من مطالبات OIDC الموثّقة. الأدوار الحالية: admin، rep، client، finance، delivery، support. لا يوجد عقد لتغيير الأدوار أو إدارة صلاحيات دقيقة؛ لا تغيّر ملفات العضوية صلاحيات الدخول.'
          : 'لا يوجد endpoint لقراءة سجل تدقيق موحد في العقود الحالية. لا تُعرض سجلات مصطنعة، ولا تُعتبر الإشعارات بديلًا لسجل التدقيق.',
      ),
    );
  }
  async function render() {
    if (!active() || saving) return;
    request.abort();
    request = new AbortController();
    const signal = AbortSignal.any([lifetime.signal, request.signal]);
    const token = ++generation;
    const route = parseRoute(win.location.hash);
    nav.replaceChildren();
    for (const [screen, title] of Object.entries(screenTitles)) {
      const item = button(doc, title, () => go(screen as Screen));
      if (screen === route.screen) item.setAttribute('aria-current', 'page');
      nav.append(item);
    }
    content.setAttribute('aria-busy', 'true');
    content.replaceChildren(el(doc, 'p', 'تحميل البيانات من الخادم…'));
    try {
      if (Object.hasOwn(paths, route.screen)) {
        const resource = route.screen as Resource;
        if (route.id === 'new') {
          const operation =
            resource === 'quotes'
              ? quoteOperation(await api.get<CatalogSnapshot>('/v1/crm/catalog', signal))
              : createOperation(resource);
          if (!operation) throw new Error('لا يتوفر عقد لإنشاء هذا السجل.');
          if (active() && token === generation) await showForm(operation);
        } else if (route.id) await detail(resource, route.id, signal, token);
        else await list(resource, route.query, signal, token);
      } else await special(route.screen, signal, token);
    } catch (error) {
      if (active() && token === generation && !signal.aborted)
        showError(error, () => void render());
    } finally {
      if (active() && token === generation) content.setAttribute('aria-busy', 'false');
    }
  }
  const onHash = () => {
    if (saving) {
      notice.textContent = 'تُستكمل العملية الحالية قبل الانتقال.';
      return;
    }
    void render();
  };
  const unload = (event: BeforeUnloadEvent) => {
    if (saving) {
      event.preventDefault();
    }
  };
  function cleanup() {
    if (disposed) return;
    disposed = true;
    generation++;
    lifetime.abort();
    request.abort();
    api.clear();
    win?.removeEventListener('hashchange', onHash);
    win?.removeEventListener('beforeunload', unload);
    options.signal?.removeEventListener('abort', outerAbort);
    lifetime.signal.removeEventListener('abort', cleanup);
    if (root.dataset.adminMount === mountId) {
      root.replaceChildren();
      delete root.dataset.adminMount;
    }
  }
  lifetime.signal.addEventListener('abort', cleanup, { once: true });
  win.addEventListener('hashchange', onHash);
  win.addEventListener('beforeunload', unload);
  try {
    await api.identity();
    if (active()) await render();
  } catch (error) {
    if (active()) {
      showError(error, () => {
        void api
          .identity()
          .then(() => render())
          .catch((error) => showError(error, () => win.location.reload()));
      });
    }
  }
  return cleanup;
}
