import type { Entity, Role } from '@elvorance/contracts';
import { ApiError } from './index.ts';
import { createLiveDataApi, type LiveDataApi, type ServerRecord } from './live-data.ts';
import { escapeHtml } from './live-format.ts';
import {
  commercialDetail,
  commercialReviewButton,
  requireReviewable,
  type CommercialDetail,
  type CommercialKind,
} from './live-commercial.ts';
import { submitCommercialAction, WorkspaceInputError } from './live-actions.ts';

export interface LiveWorkspaceOptions {
  root: HTMLElement;
  role: 'rep' | 'client' | 'admin';
  baseUrl: string;
  accessToken: () => Promise<string | null>;
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
}
interface LiveSection {
  id: string;
  label: string;
  load: () => Promise<readonly Entity[]>;
}
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
  if (role === 'client')
    return [{ id: 'invoices', label: 'الفواتير', load: api.billing.invoices }, ...shared];
  const commercial: LiveSection[] = [
    { id: 'customers', label: 'العملاء', load: api.crm.customers },
    { id: 'visits', label: 'الزيارات', load: api.sales.visits },
    ...shared,
  ];
  if (role === 'rep') return commercial;
  return [
    { id: 'approvals', label: 'الاستثناءات التجارية', load: api.sales.discountApprovals },
    { id: 'memberships', label: 'الفريق', load: api.identity.memberships },
    { id: 'regions', label: 'المناطق', load: api.crm.regions },
    ...commercial,
    { id: 'invoices', label: 'الفواتير', load: api.billing.invoices },
  ];
}
function summaryRow(row: Entity, section: string): string {
  const title = ['name', 'displayName', 'customerName', 'title', 'subject', 'label']
    .map((field) => Reflect.get(row, field) as unknown)
    .find((value) => typeof value === 'string' && value.trim().length > 0);
  const status = Reflect.get(row, 'status') as unknown;
  return (
    '<article class="card"><strong>' +
    escapeHtml(title ?? row.id) +
    '</strong>' +
    '<p class="small muted">المرجع: ' +
    escapeHtml(row.id) +
    '</p>' +
    (typeof status === 'string' ? '<span class="badge">' + escapeHtml(status) + '</span>' : '') +
    commercialReviewButton(section, row) +
    '</article>'
  );
}

/** Server-backed controls with explicit customer decisions and disposable account state. */
export async function mountLiveWorkspace(options: LiveWorkspaceOptions): Promise<() => void> {
  const { root, role } = options;
  const realm = root.ownerDocument.defaultView;
  if (!realm) throw new Error('Live workspace requires a document window.');
  if (options.signal?.aborted) return () => {};
  const requests = new AbortController();
  const mountId = crypto.randomUUID();
  root.dataset.liveMount = mountId;
  let disposed = false;
  let generation = 0;
  const active = () => !disposed && root.dataset.liveMount === mountId;
  const api = createLiveDataApi({
    baseUrl: options.baseUrl,
    signal: requests.signal,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    accessToken: async () => {
      if (!active()) return null;
      const token = await options.accessToken();
      return active() ? token : null;
    },
  });
  const sections = sectionsForRole(role, api);
  let currentSection = sections[0];
  let rows = new Map<string, Entity>();
  let review: { kind: CommercialKind; id: string } | null = null;
  let detail: CommercialDetail | null = null;

  root.innerHTML =
    '<div class="workspace" dir="rtl" style="padding:24px;max-width:1200px;margin:auto">' +
    '<header><h1>مساحة عمل إلفورانس</h1><p>بيانات حسابك ومتابعة العروض والعقود والطلبات.</p></header>' +
    '<nav aria-label="أقسام البيانات الحية" id="live-navigation" class="row wrap"></nav>' +
    '<div id="live-notice" role="status" aria-live="polite"></div>' +
    '<main id="live-content" aria-busy="true"></main></div>';
  function requireElement(selector: string): HTMLElement {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error('Live workspace could not mount: ' + selector);
    return element;
  }
  const navigation = requireElement('#live-navigation');
  const content = requireElement('#live-content');
  const notice = requireElement('#live-notice');
  const info = (message: string) => {
    if (active()) notice.textContent = message;
  };
  function errorMessage(error: unknown): string {
    if (error instanceof WorkspaceInputError) return error.message;
    if (error instanceof ApiError) {
      if (error.status === 401) return 'يجب تسجيل الدخول للوصول إلى بيانات الشركة.';
      if (error.status === 403) return 'هذا الحساب لا يملك صلاحية هذا الإجراء.';
      if (error.status === 409)
        return 'تغير السجل أو لم تعد حالته تسمح بهذا القرار. حدّث التفاصيل وراجعها قبل إعادة المحاولة.';
      if (error.code === 'invalid_response')
        return 'لم تصل تفاصيل كاملة صالحة للمراجعة. أعد تحميل السجل قبل تأكيد أي قرار.';
      return 'تعذّر الاتصال بالخدمة (' + error.code + ').';
    }
    return 'فشل طلب البيانات. تحقق من الاتصال ثم أعد المحاولة بنفس الطلب.';
  }
  function customerForm(): string {
    return (
      '<form class="card stack" data-live-form="customer"><h2>إضافة عميل</h2>' +
      '<label>الاسم <input class="input" name="name" required minlength="2" maxlength="200"></label>' +
      (role === 'admin'
        ? '<label>معرّف المندوب <input class="input" name="repId" required maxlength="100"></label>'
        : '') +
      '<label>الهاتف <input class="input" name="phone" type="tel" maxlength="40"></label>' +
      '<label>البريد الإلكتروني <input class="input" name="email" type="email" maxlength="200"></label>' +
      '<button class="btn btn-primary" type="submit">حفظ العميل</button></form>'
    );
  }
  function ticketForm(): string {
    return (
      '<form class="card stack" data-live-form="ticket"><h2>طلب دعم جديد</h2>' +
      '<label>العنوان <input class="input" name="subject" required minlength="3" maxlength="200"></label>' +
      '<label>نوع الطلب <select class="select" name="category"><option value="general">عام</option><option value="billing">الفواتير</option><option value="delivery">المشروع</option><option value="account">الحساب</option></select></label>' +
      '<label>الرسالة <textarea class="textarea" name="message" required minlength="5" maxlength="5000"></textarea></label>' +
      '<button class="btn btn-primary" type="submit">إرسال طلب الدعم</button></form>'
    );
  }
  async function render(message = ''): Promise<void> {
    if (!active() || !currentSection) return;
    const token = ++generation;
    const section = currentSection;
    const currentReview = review;
    detail = null;
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
    content.textContent = 'تحميل البيانات…';
    info(message);
    try {
      if (currentReview) {
        const source = rows.get(currentReview.id) as ServerRecord | undefined;
        if (!source) throw new WorkspaceInputError('حدّث القائمة ثم اختر السجل المطلوب.');
        const expectedId = currentReview.kind === 'approval' ? String(source.quoteId) : source.id;
        const value =
          currentReview.kind === 'contract'
            ? await api.sales.contract(source.id)
            : await api.sales.quote(expectedId);
        if (!active() || token !== generation) return;
        if (value.id !== expectedId)
          throw new ApiError(
            200,
            'invalid_response',
            'The returned review record does not match the requested record.',
          );
        requireReviewable(value);
        detail = {
          kind: currentReview.kind,
          value,
          ...(currentReview.kind === 'approval' ? { approval: source } : {}),
        };
        content.innerHTML = commercialDetail(detail, role);
      } else {
        const loaded = await section.load();
        if (!active() || token !== generation) return;
        rows = new Map(loaded.map((row) => [row.id, row]));
        const forms =
          section.id === 'customers' && role !== 'client'
            ? customerForm()
            : section.id === 'tickets' && role !== 'admin'
              ? ticketForm()
              : '';
        content.innerHTML =
          '<h2>' +
          escapeHtml(section.label) +
          ' (' +
          loaded.length +
          ')</h2><div class="grid-2">' +
          (loaded.length
            ? loaded.map((row) => summaryRow(row, section.id)).join('')
            : '<p>لا توجد سجلات لهذا الحساب.</p>') +
          '</div>' +
          forms;
      }
    } catch (error) {
      if (!active() || token !== generation) return;
      content.innerHTML =
        '<div class="card" role="alert"><h2>تعذّر تحميل التفاصيل</h2><p>' +
        escapeHtml(errorMessage(error)) +
        '</p><button class="btn btn-primary" type="button" data-live-retry>إعادة المحاولة</button>' +
        (currentReview
          ? '<button class="btn btn-secondary" type="button" data-live-back>العودة إلى القائمة</button>'
          : '') +
        '</div>';
    } finally {
      if (active() && token === generation) content.setAttribute('aria-busy', 'false');
    }
  }
  function onClick(event: Event): void {
    if (!active() || !(event.target instanceof realm!.Element)) return;
    const element = event.target;
    const nav = element.closest<HTMLElement>('[data-live-section]');
    if (nav) {
      const target = sections.find((section) => section.id === nav.dataset.liveSection);
      if (target) {
        currentSection = target;
        review = null;
        void render();
      }
      return;
    }
    const reviewButton = element.closest<HTMLElement>('[data-live-review]');
    if (reviewButton && rows.has(reviewButton.dataset.id ?? '')) {
      const kind = reviewButton.dataset.liveReview;
      if (kind === 'quote' || kind === 'contract' || (kind === 'approval' && role === 'admin')) {
        review = { kind, id: reviewButton.dataset.id! };
        void render();
      }
      return;
    }
    if (element.closest('[data-live-back]')) {
      review = null;
      void render();
      return;
    }
    if (element.closest('[data-live-retry]')) void render();
  }
  function onInput(event: Event): void {
    if (!active() || !(event.target instanceof realm!.Element)) return;
    const form = event.target.closest<HTMLFormElement>('form[data-live-form]');
    if (form && form.dataset.pending !== 'true') delete form.dataset.intentKey;
  }
  function onSubmit(event: Event): void {
    if (
      !active() ||
      !(event.target instanceof realm!.HTMLFormElement) ||
      !event.target.matches('[data-live-form]')
    )
      return;
    event.preventDefault();
    const form = event.target;
    if (form.dataset.pending === 'true' || !form.reportValidity()) return;
    const values = new realm!.FormData(form);
    const get = (name: string) => String(values.get(name) ?? '').trim();
    const intentKey = form.dataset.intentKey ?? crypto.randomUUID();
    form.dataset.intentKey = intentKey;
    form.dataset.pending = 'true';
    const controls = Array.from(
      form.querySelectorAll<
        HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement
      >('input,button,select,textarea'),
    );
    const disabled = controls.map((control) => control.disabled);
    controls.forEach((control) => {
      control.disabled = true;
    });
    const operationGeneration = generation;
    const currentDetail = detail;
    info('جارٍ تسجيل القرار…');
    void (async () => {
      if (!active()) return;
      const kind = form.dataset.liveForm ?? '';
      let message = await submitCommercialAction(kind, values, currentDetail, role, api, {
        idempotencyKey: intentKey,
      });
      if (message === null && kind === 'customer' && role !== 'client') {
        await api.crm.createCustomer(
          {
            name: get('name'),
            phone: get('phone'),
            email: get('email'),
            ...(role === 'admin' ? { repId: get('repId') } : {}),
          },
          { idempotencyKey: intentKey },
        );
        message = 'تم حفظ العميل.';
      } else if (message === null && kind === 'ticket' && role !== 'admin') {
        const category = get('category');
        if (!['billing', 'delivery', 'account', 'general'].includes(category))
          throw new WorkspaceInputError('اختر نوعًا صالحًا لطلب الدعم.');
        await api.communications.createTicket(
          {
            subject: get('subject'),
            category: category as 'billing' | 'delivery' | 'account' | 'general',
            message: get('message'),
          },
          { idempotencyKey: intentKey },
        );
        message = 'تم حفظ طلب الدعم.';
      } else if (message === null) throw new WorkspaceInputError('الإجراء غير متاح لهذا الحساب.');
      if (!active()) return;
      delete form.dataset.intentKey;
      if (operationGeneration === generation) {
        review = null;
        await render(message);
      } else info(message);
    })()
      .catch((error: unknown) => {
        if (active()) info(errorMessage(error));
      })
      .finally(() => {
        delete form.dataset.pending;
        controls.forEach((control, index) => {
          control.disabled = disabled[index] ?? false;
        });
      });
  }
  function cleanup(): void {
    if (disposed) return;
    disposed = true;
    generation++;
    requests.abort();
    root.removeEventListener('click', onClick);
    root.removeEventListener('input', onInput);
    root.removeEventListener('submit', onSubmit);
    options.signal?.removeEventListener('abort', cleanup);
    rows.clear();
    detail = null;
    review = null;
    if (root.dataset.liveMount === mountId) {
      root.replaceChildren();
      delete root.dataset.liveMount;
    }
  }
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', onSubmit);
  options.signal?.addEventListener('abort', cleanup, { once: true });
  try {
    const identity = await api.identity.me();
    if (!active()) return cleanup;
    const requiredRole: Role = role;
    if (!identity.principal.roles.includes(requiredRole))
      throw new ApiError(403, 'forbidden', 'Authenticated user does not have this role.');
    await render();
  } catch (error) {
    if (active()) {
      generation++;
      content.setAttribute('aria-busy', 'false');
      content.innerHTML =
        '<div class="card" role="alert"><h2>يتطلب التطبيق اتصالًا مصادقًا</h2><p>' +
        escapeHtml(errorMessage(error)) +
        '</p></div>';
    }
  }
  return cleanup;
}
