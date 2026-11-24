import { statePanel } from '@elvorance/ui/enterprise-ux';
import { installMobileShell } from '@elvorance/mobile-platform';
import type { MobileAuth } from '@elvorance/mobile-auth';
import type { RepApi, RepIdentity } from './api.ts';
import type { Page, View } from './context.ts';
import { button, el, errorMessage, words } from './ui/dom.ts';
import { TrackingController } from './tracking.ts';
import { home } from './views/home.ts';
import { schedule } from './views/schedule.ts';
import { customers } from './views/customers.ts';
import { visits } from './views/visits.ts';
import { opportunities, routes, tasks } from './views/planning.ts';
import { quotes } from './views/quotes.ts';
import { messages } from './views/messages.ts';
import { support } from './views/support.ts';
import { catalog, contracts, projects, billing, notifications } from './views/records.ts';
import { account, tracking } from './views/account.ts';

const pages: Record<Page, { label: string; view: View }> = {
  home: { label: 'الرئيسية', view: home },
  schedule: { label: 'جدول العمل', view: schedule },
  customers: { label: 'العملاء', view: customers },
  visits: { label: 'الزيارات', view: visits },
  routes: { label: 'خطط الزيارات', view: routes },
  opportunities: { label: 'الفرص', view: opportunities },
  quotes: { label: 'العروض', view: quotes },
  catalog: { label: 'الخدمات', view: catalog },
  tasks: { label: 'المهام', view: tasks },
  messages: { label: 'المحادثات', view: messages },
  notifications: { label: 'الإشعارات', view: notifications },
  contracts: { label: 'العقود', view: contracts },
  projects: { label: 'المشاريع', view: projects },
  billing: { label: 'الفواتير', view: billing },
  support: { label: 'الدعم', view: support },
  tracking: { label: 'الموقع', view: tracking },
  account: { label: 'حسابي', view: account },
};
export async function mountRepWorkspace(
  root: HTMLElement,
  api: RepApi,
  auth: MobileAuth,
  environment: string,
  signal: AbortSignal,
): Promise<() => Promise<void>> {
  const identity = await api.get<RepIdentity>('/v1/identity/me', { signal });
  if (!identity.principal.roles.includes('rep') || !identity.principal.repId)
    throw new Error('هذا الحساب لا يملك صلاحية تطبيق المندوب.');
  if (signal.aborted) return async () => {};
  const shell = el('div', '', 'rep-shell');
  const header = el('header', '', 'app-header');
  const brand = el('div');
  brand.append(
    el('strong', 'إلفورانس الميداني'),
    el('small', words(identity.profile?.displayName, 'مرحبًا بك')),
  );
  header.append(brand);
  if (environment === 'staging') header.append(el('span', 'بيئة الاختبار', 'environment-badge'));
  const notice = el('p', '', 'app-status');
  notice.setAttribute('role', 'status');
  const nav = el('nav', '', 'app-nav');
  nav.setAttribute('aria-label', 'أقسام التطبيق');
  const main = el('main', '', 'page');
  main.id = 'rep-content';
  shell.append(header, nav, notice, main);
  root.replaceChildren(shell);
  const notify = (message: string) => {
    if (!signal.aborted) notice.textContent = message;
  };
  const location = new TrackingController(api, (snapshot) => {
    for (const node of root.querySelectorAll<HTMLElement>('[data-tracking-status]'))
      node.textContent = snapshot.status;
  });
  let viewAbort = new AbortController();
  let current: Page = 'home';
  let disposed = false;
  let loggingOut = false;
  const navigate = async (page: Page, push = true, committed = false): Promise<void> => {
    if (disposed || signal.aborted) return;
    if (!committed && main.querySelector('form[aria-busy="true"]')) {
      notify('انتظر تأكيد العملية الحالية قبل الانتقال.');
      return;
    }
    current = page;
    viewAbort.abort();
    viewAbort = new AbortController();
    const requestSignal = AbortSignal.any([signal, viewAbort.signal]);
    for (const node of nav.querySelectorAll<HTMLElement>('[data-page]'))
      node.setAttribute('aria-current', node.dataset.page === page ? 'page' : 'false');
    if (push && window.location.hash !== '#' + page) history.pushState({ page }, '', '#' + page);
    main.replaceChildren(statePanel('loading', 'جارٍ تحميل البيانات…'));
    main.setAttribute('aria-busy', 'true');
    const container = el('div');
    try {
      await pages[page].view({
        api,
        principal: identity.principal,
        root: container,
        signal: requestSignal,
        notify,
        navigate,
        refresh: () => navigate(current, false, true),
        tracking: location,
      });
      if (!requestSignal.aborted) {
        main.replaceChildren(container);
        main.removeAttribute('aria-busy');
        document.title = `${pages[page].label} · إلفورانس الميداني`;
      }
    } catch (error) {
      if (requestSignal.aborted) return;
      main.removeAttribute('aria-busy');
      main.replaceChildren(
        statePanel('error', errorMessage(error)),
        button('إعادة المحاولة', () => navigate(current, false), requestSignal),
      );
    }
  };
  for (const [id, page] of Object.entries(pages)) {
    const link = button(page.label, () => navigate(id as Page), signal, 'nav-link');
    link.dataset.page = id;
    nav.append(link);
  }
  header.append(button('تحديث', () => navigate(current, false), signal, 'button subtle'));
  header.append(
    button(
      'تسجيل الخروج',
      async () => {
        if (loggingOut) return;
        if (main.querySelector('form[aria-busy="true"]')) {
          notify('انتظر تأكيد الحفظ قبل تسجيل الخروج.');
          return;
        }
        loggingOut = true;
        shell.inert = true;
        shell.setAttribute('aria-busy', 'true');
        try {
          // Stop native GPS before credentials are removed; logout still works during an outage.
          try {
            await location.stop();
          } catch {
            notify('توقف الموقع على الجهاز؛ تعذّر تأكيد الإنهاء بالخدمة.');
          }
          const result = await auth.signOut();
          if (!result.revoked) window.dispatchEvent(new CustomEvent('rep:logout-unconfirmed'));
        } finally {
          loggingOut = false;
          if (!signal.aborted) {
            shell.inert = false;
            shell.removeAttribute('aria-busy');
          }
        }
      },
      signal,
      'button subtle',
    ),
  );
  root.addEventListener(
    'rep:error',
    (event) => notify(errorMessage((event as CustomEvent<unknown>).detail)),
    { signal },
  );
  window.addEventListener(
    'offline',
    () =>
      notify(
        'الاتصال منقطع. لا تُرسل التغييرات دون شبكة. تبقى مدخلات النموذج في هذه الصفحة فقط؛ لا تغلق التطبيق.',
      ),
    { signal },
  );
  window.addEventListener(
    'online',
    () => notify('عاد الاتصال. حدّث الصفحة للحصول على أحدث البيانات.'),
    { signal },
  );
  window.addEventListener(
    'popstate',
    () => {
      const page = window.location.hash.slice(1);
      if (Object.hasOwn(pages, page)) void navigate(page as Page, false);
    },
    { signal },
  );
  const removeNative = await installMobileShell({
    closeModal: () => {
      if (main.querySelector('form[aria-busy="true"]')) {
        notify('انتظر تأكيد الحفظ قبل إغلاق النموذج.');
        return;
      }
      main.querySelector('.editor')?.remove();
    },
  });
  let cleanup: Promise<void> | null = null;
  const remove = (): Promise<void> => {
    if (cleanup) return cleanup;
    disposed = true;
    viewAbort.abort();
    cleanup = (async () => {
      const results = await Promise.allSettled([location.dispose(), removeNative()]);
      if (results.some((result) => result.status === 'rejected'))
        throw new Error('تعذّر إغلاق أحد موارد الجهاز. أغلق التطبيق وأعد المحاولة.');
    })();
    return cleanup;
  };
  if (signal.aborted) {
    await remove();
    return remove;
  }
  signal.addEventListener(
    'abort',
    () => {
      // The owning bootstrap also awaits this same cleanup promise and reports any failure.
      void remove().catch(() => undefined);
    },
    { once: true },
  );
  void location
    .initialize()
    .catch(() => notify('وظائف العملاء متاحة. تعذّر التحقق من جلسة الموقع؛ حاول لاحقًا.'));
  const initialPage = window.location.hash.slice(1);
  await navigate(Object.hasOwn(pages, initialPage) ? (initialPage as Page) : 'home', false);
  return remove;
}
