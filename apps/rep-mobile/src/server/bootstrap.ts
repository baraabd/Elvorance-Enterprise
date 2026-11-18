import {
  AuthError,
  attachAuthHost,
  createMobileAuth,
  type AuthHost,
  type MobileAuthConfig,
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
  let host: AuthHost | null = null;

  function login(message: string, signal: AbortSignal): void {
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
      signal,
      'button primary',
    );
    panel.append(status, signIn);
    root.replaceChildren(panel);
    root.className = 'rep-root';
  }

  root.replaceChildren(el('p', 'جارٍ تهيئة الاتصال الآمن…', 'empty'));
  host = await attachAuthHost({
    auth,
    onReset: () => api.clear(),
    signedOut(session, signal) {
      login(
        session.status === 'unavailable'
          ? 'تعذّر تجديد الجلسة. تحقق من الشبكة ثم سجّل الدخول.'
          : '',
        signal,
      );
    },
    async mount(_session, signal) {
      root.replaceChildren(el('p', 'جارٍ التحقق من صلاحيات الحساب…', 'empty'));
      return mount(root, api, auth, config.auth.environment, signal);
    },
    error(error, signal) {
      const panel = card('تعذّر فتح مساحة العمل');
      panel.append(
        el('p', error instanceof AuthError ? error.message : errorMessage(error), 'notice'),
      );
      panel.append(
        button('إعادة المحاولة', () => host?.retry(), signal),
        button(
          'تغيير الحساب',
          async () => {
            await auth.signOut();
          },
          signal,
        ),
      );
      root.replaceChildren(panel);
    },
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
    lifetime.abort();
    try {
      await host?.dispose();
    } finally {
      root.replaceChildren();
    }
  };
}
