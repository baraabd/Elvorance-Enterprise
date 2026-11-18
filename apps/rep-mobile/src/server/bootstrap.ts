import {
  AuthError,
  createMobileAuth,
  type MobileAuthConfig,
  type AuthSessionSnapshot,
} from '@elvorance/mobile-auth';
import { createRepApi } from './api.ts';
import { button, card, el, errorMessage } from './ui/dom.ts';
import { mountRepWorkspace } from './workspace.ts';

export interface ServerConfiguration {
  dataMode: 'server';
  apiBaseUrl: string;
  environment?: 'development' | 'staging' | 'production';
  auth: MobileAuthConfig;
}

/** Explicit ports let lifecycle tests control deferred authentication and mounting. */
export interface RepresentativeBootstrapPorts {
  createAuth: typeof createMobileAuth;
  createApi: typeof createRepApi;
  mountWorkspace: typeof mountRepWorkspace;
}

export async function startRepresentative(
  root: HTMLElement,
  config: ServerConfiguration,
  ports: Partial<RepresentativeBootstrapPorts> = {},
): Promise<() => Promise<void>> {
  if (
    config.dataMode !== 'server' ||
    !config.apiBaseUrl ||
    !config.auth ||
    (config.environment && config.environment !== config.auth.environment)
  ) {
    throw new Error('إعدادات الاتصال الآمن غير مكتملة.');
  }
  const endpoint = new URL(config.apiBaseUrl);
  if (endpoint.protocol !== 'https:' && config.auth.environment !== 'development') {
    throw new Error('يجب استخدام اتصال HTTPS في بيئة الاختبار والإنتاج.');
  }
  const auth = (ports.createAuth ?? createMobileAuth)(config.auth);
  const api = (ports.createApi ?? createRepApi)({
    baseUrl: config.apiBaseUrl,
    accessToken: () => auth.getAccessToken(),
  });
  const mount = ports.mountWorkspace ?? mountRepWorkspace;
  const lifetime = new AbortController();
  let screen = new AbortController();
  let removeWorkspace: (() => Promise<void>) | null = null;
  let subject: string | null = null;
  let revision = 0;
  let closed = false;
  let latest: AuthSessionSnapshot = { status: 'signed-out', subject: null, expiresAt: null };

  async function reset(): Promise<void> {
    screen.abort();
    screen = new AbortController();
    subject = null;
    const remove = removeWorkspace;
    removeWorkspace = null;
    // Clear account-scoped request keys synchronously, before another screen can start requests.
    api.clear();
    if (remove) await remove();
  }

  function login(message = ''): void {
    const panel = card(
      'إلفورانس الميداني',
      config.auth.environment === 'staging' ? 'بيئة اختبار مستقلة' : 'مساحة عمل المندوب',
    );
    const status = el('p', message || 'سجّل الدخول بحساب الشركة للمتابعة.', 'notice');
    status.setAttribute('role', 'status');
    const signIn = button(
      'تسجيل الدخول الآمن',
      async () => {
        signIn.disabled = true;
        status.textContent = 'جارٍ فتح تسجيل الدخول…';
        try {
          await auth.signIn();
        } catch (error) {
          status.textContent = error instanceof AuthError ? error.message : errorMessage(error);
        } finally {
          signIn.disabled = false;
        }
      },
      screen.signal,
      'button primary',
    );
    panel.append(status, signIn);
    root.replaceChildren(panel);
    root.className = 'rep-root';
  }

  async function renderSession(session: AuthSessionSnapshot): Promise<void> {
    if (closed || session.status === 'signing-in' || session.status === 'refreshing') return;
    if (session.status === 'authenticated' && session.subject && subject === session.subject)
      return;
    const requestedRevision = ++revision;
    await reset();
    // A newer logout/account change always wins, even if native cleanup resolved out of order.
    if (closed || requestedRevision !== revision) return;
    if (session.status !== 'authenticated' || !session.subject) {
      login(
        session.status === 'unavailable'
          ? 'تعذّر تجديد الجلسة. تحقق من الشبكة ثم سجّل الدخول.'
          : '',
      );
      return;
    }
    subject = session.subject;
    const mountedSignal = AbortSignal.any([lifetime.signal, screen.signal]);
    root.replaceChildren(el('p', 'جارٍ التحقق من صلاحيات الحساب…', 'empty'));
    try {
      const remove = await mount(root, api, auth, config.auth.environment, mountedSignal);
      if (closed || mountedSignal.aborted || requestedRevision !== revision) await remove();
      else removeWorkspace = remove;
    } catch (error) {
      if (mountedSignal.aborted || requestedRevision !== revision || closed) return;
      const message = errorMessage(error);
      await reset();
      if (closed || requestedRevision !== revision) return;
      const panel = card('تعذّر فتح مساحة العمل');
      panel.append(el('p', message, 'notice'));
      panel.append(
        button('إعادة المحاولة', () => renderSession(latest), screen.signal),
        button(
          'تغيير الحساب',
          async () => {
            await auth.signOut();
          },
          screen.signal,
        ),
      );
      root.replaceChildren(panel);
    }
  }

  root.replaceChildren(el('p', 'جارٍ تهيئة الاتصال الآمن…', 'empty'));
  try {
    await auth.initialize();
  } catch (error) {
    login(error instanceof AuthError ? error.message : errorMessage(error));
  }
  const unsubscribe = auth.onSessionChanged((session) => {
    latest = session;
    void renderSession(session).catch(() => {
      if (!closed) login('تعذّر إغلاق موارد الجلسة السابقة بأمان. أغلق التطبيق وأعد المحاولة.');
    });
  });
  window.addEventListener(
    'rep:logout-unconfirmed',
    () => {
      const status = root.querySelector<HTMLElement>('[role="status"]');
      if (status)
        status.textContent =
          'تم تسجيل الخروج من الجهاز. تعذّر تأكيد إلغاء الجلسة بالخادم لانقطاع الاتصال.';
    },
    { signal: lifetime.signal },
  );
  return async () => {
    closed = true;
    ++revision;
    lifetime.abort();
    unsubscribe();
    try {
      await reset();
    } finally {
      await auth.dispose();
      root.replaceChildren();
    }
  };
}
