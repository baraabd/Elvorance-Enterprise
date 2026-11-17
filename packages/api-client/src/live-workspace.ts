import type { Entity, Role } from '@elvorance/contracts';
import { ApiError } from './index.ts';
import { createLiveDataApi, type LiveDataApi } from './live-data.ts';

export interface LiveWorkspaceOptions {
  root: HTMLElement;
  role: 'rep' | 'client' | 'admin';
  baseUrl: string;
  accessToken: () => Promise<string | null>;
}

interface LiveSection {
  id: string;
  label: string;
  load: () => Promise<readonly Entity[]>;
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (char) => {
    const escaped: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escaped[char] ?? char;
  });

export function sectionsForRole(
  role: LiveWorkspaceOptions['role'],
  api: LiveDataApi,
): LiveSection[] {
  const shared: LiveSection[] = [
    { id: 'quotes', label: 'عروض الأسعار', load: api.sales.quotes },
    { id: 'contracts', label: 'العقود', load: api.sales.contracts },
    { id: 'projects', label: 'المشاريع', load: api.delivery.projects },
    { id: 'tickets', label: 'الدعم', load: api.communications.tickets },
    { id: 'notifications', label: 'الإشعارات', load: api.communications.notifications },
  ];
  if (role === 'client') {
    return [{ id: 'invoices', label: 'الفواتير', load: api.billing.invoices }, ...shared];
  }
  const commercial: LiveSection[] = [
    { id: 'customers', label: 'العملاء', load: api.crm.customers },
    { id: 'visits', label: 'الزيارات', load: api.sales.visits },
    ...shared,
  ];
  if (role === 'rep') return commercial;
  return [
    { id: 'memberships', label: 'الفريق', load: api.identity.memberships },
    { id: 'regions', label: 'المناطق', load: api.crm.regions },
    ...commercial,
    { id: 'invoices', label: 'الفواتير', load: api.billing.invoices },
  ];
}

function summaryRow(row: Entity): string {
  const fields = ['name', 'displayName', 'customerName', 'title', 'subject', 'label'];
  const title = fields
    .map((field) => Reflect.get(row, field) as unknown)
    .find((value) => typeof value === 'string' && value.trim().length > 0);
  const status = Reflect.get(row, 'status') as unknown;
  return (
    '<article class="card">' +
    '<strong>' +
    escapeHtml(title ?? row.id) +
    '</strong>' +
    '<p class="small muted">رقم السجل: ' +
    escapeHtml(row.id) +
    '</p>' +
    (typeof status === 'string' ? '<span class="badge">' + escapeHtml(status) + '</span>' : '') +
    '</article>'
  );
}

/**
 * Server-only operational workspace.
 *
 * The legacy 64-route preview is not used in this mode. This is an independent
 * integration slice for existing API endpoints, not full feature parity.
 * No seeded records or localStorage writes can silently stand in for API data.
 */
export async function mountLiveWorkspace(options: LiveWorkspaceOptions): Promise<void> {
  const { root, role } = options;
  const api = createLiveDataApi({
    baseUrl: options.baseUrl,
    accessToken: options.accessToken,
  });
  const sections = sectionsForRole(role, api);
  let currentSection = sections[0];
  let generation = 0;

  root.innerHTML =
    '<div class="workspace" dir="rtl" style="padding:24px;max-width:1200px;margin:auto">' +
    '<header><h1>إلفورانس — البيانات الحية</h1>' +
    '<p>البيانات من API وقواعد الخدمات؛ لا توجد بيانات تجريبية في هذا الوضع.</p></header>' +
    '<nav aria-label="أقسام البيانات الحية" id="live-navigation" class="row wrap"></nav>' +
    '<div id="live-notice" role="status" aria-live="polite"></div>' +
    '<main id="live-content" aria-busy="true"></main>' +
    '</div>';

  const requireElement = (selector: string): HTMLElement => {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error('Live workspace could not mount: ' + selector);
    return element;
  };
  const navigation = requireElement('#live-navigation');
  const content = requireElement('#live-content');
  const notice = requireElement('#live-notice');

  const info = (message: string) => {
    notice.textContent = message;
  };

  const errorMessage = (error: unknown): string => {
    if (error instanceof ApiError) {
      if (error.status === 401) return 'يجب تسجيل الدخول للوصول إلى بيانات الشركة.';
      if (error.status === 403) return 'هذا الحساب لا يملك صلاحية هذا الإجراء.';
      if (error.status === 409) return 'السجل تغير في جلسة أخرى. حدّث البيانات قبل إعادة المحاولة.';
      return 'تعذّر الاتصال بالخدمة (' + error.code + ').';
    }
    return 'فشل طلب البيانات. تحقق من اتصال API ثم أعد المحاولة.';
  };

  const createCustomerForm = (): string =>
    '<form class="card stack" data-live-form="customer">' +
    '<h2>إضافة عميل في PostgreSQL</h2>' +
    '<label>الاسم <input class="input" name="name" required minlength="2" maxlength="200" /></label>' +
    (role === 'admin'
      ? '<label>معرّف المندوب <input class="input" name="repId" required maxlength="100" /></label>'
      : '') +
    '<label>الهاتف <input class="input" name="phone" type="tel" maxlength="40" /></label>' +
    '<label>البريد الإلكتروني <input class="input" name="email" type="email" maxlength="200" /></label>' +
    '<button class="btn btn-primary" type="submit">حفظ العميل على الخادم</button>' +
    '</form>';

  const createTicketForm = (): string =>
    '<form class="card stack" data-live-form="ticket">' +
    '<h2>طلب دعم جديد</h2>' +
    '<label>العنوان <input class="input" name="subject" required minlength="3" maxlength="200" /></label>' +
    '<label>نوع الطلب <select class="select" name="category">' +
    '<option value="general">عام</option><option value="billing">الفواتير</option>' +
    '<option value="delivery">المشروع</option><option value="account">الحساب</option></select></label>' +
    '<label>الرسالة <textarea class="textarea" name="message" required minlength="5" maxlength="5000"></textarea></label>' +
    '<button class="btn btn-primary" type="submit">إرسال الطلب للخادم</button>' +
    '</form>';

  async function render(): Promise<void> {
    if (!currentSection) return;
    const token = ++generation;
    const section = currentSection;
    navigation.innerHTML = sections
      .map(
        (item) =>
          '<button type="button" class="btn ' +
          (item.id === section.id ? 'btn-primary' : 'btn-secondary') +
          '" data-live-section="' +
          escapeHtml(item.id) +
          '">' +
          escapeHtml(item.label) +
          '</button>',
      )
      .join('');
    content.setAttribute('aria-busy', 'true');
    content.textContent = 'تحميل البيانات من الخادم…';
    info('');
    try {
      const rows = await section.load();
      if (token !== generation) return;
      const forms =
        section.id === 'customers' && role !== 'client'
          ? createCustomerForm()
          : section.id === 'tickets' && role !== 'admin'
            ? createTicketForm()
            : '';
      content.innerHTML =
        '<h2>' +
        escapeHtml(section.label) +
        ' (' +
        rows.length +
        ')</h2>' +
        '<div class="grid-2">' +
        (rows.length ? rows.map(summaryRow).join('') : '<p>لا توجد سجلات لهذا الحساب.</p>') +
        '</div>' +
        forms;
    } catch (error) {
      if (token !== generation) return;
      content.innerHTML =
        '<div class="card" role="alert"><h2>تعذّر تحميل البيانات</h2><p>' +
        escapeHtml(errorMessage(error)) +
        '</p><button class="btn btn-primary" type="button" data-live-retry>إعادة المحاولة</button></div>';
    } finally {
      if (token === generation) content.setAttribute('aria-busy', 'false');
    }
  }

  root.addEventListener('click', (event) => {
    const element = event.target;
    if (!(element instanceof Element)) return;
    const nav = element.closest<HTMLElement>('[data-live-section]');
    if (nav) {
      const target = sections.find((section) => section.id === nav.dataset.liveSection);
      if (target) {
        currentSection = target;
        void render();
      }
    }
    if (element.closest('[data-live-retry]')) void render();
  });

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof Element) {
      const form = target.closest<HTMLFormElement>('form[data-live-form]');
      if (form) delete form.dataset.intentKey;
    }
  });

  root.addEventListener('submit', (event) => {
    const element = event.target;
    if (!(element instanceof HTMLFormElement) || !element.matches('[data-live-form]')) return;
    event.preventDefault();
    const form = element;
    const values = new FormData(form);
    const get = (name: string) => String(values.get(name) ?? '').trim();
    const intentKey = form.dataset.intentKey ?? crypto.randomUUID();
    form.dataset.intentKey = intentKey;
    const submit = form.querySelector<HTMLButtonElement>('button[type=submit]');
    if (submit) submit.disabled = true;
    info('حفظ الطلب على الخادم…');
    void (async () => {
      if (form.dataset.liveForm === 'customer') {
        const payload = {
          name: get('name'),
          phone: get('phone'),
          email: get('email'),
          ...(role === 'admin' ? { repId: get('repId') } : {}),
        };
        await api.crm.createCustomer(payload, { idempotencyKey: intentKey });
      } else if (form.dataset.liveForm === 'ticket') {
        const category = get('category');
        if (!['billing', 'delivery', 'account', 'general'].includes(category))
          throw new Error('Invalid ticket category');
        await api.communications.createTicket(
          {
            subject: get('subject'),
            category: category as 'billing' | 'delivery' | 'account' | 'general',
            message: get('message'),
          },
          { idempotencyKey: intentKey },
        );
      }
      info('تم حفظ الطلب على الخادم.');
      delete form.dataset.intentKey;
      await render();
    })()
      .catch((error: unknown) => info(errorMessage(error)))
      .finally(() => {
        if (submit) submit.disabled = false;
      });
  });

  try {
    const identity = await api.identity.me();
    const requiredRole: Role = role;
    if (!identity.principal.roles.includes(requiredRole)) {
      throw new ApiError(403, 'forbidden', 'Authenticated user does not have this role.');
    }
    await render();
  } catch (error) {
    generation++;
    content.setAttribute('aria-busy', 'false');
    content.innerHTML =
      '<div class="card" role="alert"><h2>يتطلب التطبيق اتصالًا مصادقًا</h2><p>' +
      escapeHtml(errorMessage(error)) +
      '</p></div>';
  }
}
