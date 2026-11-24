import type { Principal } from '@elvorance/contracts';
import {
  AuthError,
  attachAuthHost,
  createMobileAuth,
  type AuthHost,
  type MobileAuthConfig,
} from '@elvorance/mobile-auth';
import { ApiError, createApiClient } from './index.ts';
import { mountLiveWorkspace, type LiveWorkspaceOptions } from './live-workspace.ts';

export interface AuthenticatedWorkspaceOptions {
  root: HTMLElement;
  role: LiveWorkspaceOptions['role'];
  baseUrl: string;
  auth?: MobileAuthConfig;
  environment?: MobileAuthConfig['environment'];
  /** Application-owned server UI; authentication and disposal remain centralized. */
  mountWorkspace?: typeof mountLiveWorkspace;
  /** Explicit compatibility port. Its owner remains responsible for its session lifecycle. */
  externalAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
}

function message(error: unknown): string {
  if (error instanceof AuthError) return error.message;
  if (error instanceof ApiError && error.status === 403)
    return 'هذا الحساب لا يملك صلاحية مساحة العمل المطلوبة.';
  if (error instanceof ApiError && error.status === 401)
    return 'يلزم تسجيل الدخول بحساب صالح للمتابعة.';
  return 'تعذّر فتح مساحة العمل. تحقق من الاتصال وإعدادات المصادقة.';
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

/** Same auth/session coordinator as the representative app, with role-specific web clients. */
export async function mountAuthenticatedWorkspace(
  options: AuthenticatedWorkspaceOptions,
): Promise<() => Promise<void>> {
  if (
    !options.baseUrl ||
    (options.environment && options.auth && options.environment !== options.auth.environment)
  ) {
    throw new Error('إعدادات مساحة العمل والمصادقة غير متوافقة.');
  }
  const environment = options.auth?.environment ?? options.environment;
  const endpoint = new URL(options.baseUrl);
  const legacyLoopback =
    !options.auth &&
    environment === undefined &&
    endpoint.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if (environment !== 'development' && endpoint.protocol !== 'https:' && !legacyLoopback) {
    throw new Error('تتطلب مساحة العمل اتصال HTTPS مصادقًا.');
  }
  const { root, role } = options;
  const mountWorkspace = options.mountWorkspace ?? mountLiveWorkspace;
  root.setAttribute('dir', 'rtl');

  async function verify(accessToken: () => Promise<string | null>, signal: AbortSignal) {
    const api = createApiClient({ baseUrl: options.baseUrl, accessToken });
    const identity = await api.get<{ principal: Principal }>('/v1/identity/me', { signal });
    if (!identity.principal.roles.includes(role))
      throw new ApiError(403, 'forbidden', 'Required workspace role is missing.');
  }

  if (!options.auth) {
    if (!options.externalAccessToken)
      throw new Error('يجب إعداد موفر المصادقة قبل فتح مساحة العمل.');
    const lifetime = new AbortController();
    const accessToken = async () => {
      if (lifetime.signal.aborted) return null;
      const token = await options.externalAccessToken!();
      return lifetime.signal.aborted ? null : (token ?? null);
    };
    try {
      await verify(accessToken, lifetime.signal);
      const remove = await mountWorkspace({
        root,
        role,
        baseUrl: options.baseUrl,
        accessToken,
        signal: lifetime.signal,
      });
      return async () => {
        lifetime.abort();
        await remove();
        root.replaceChildren();
      };
    } catch (error) {
      lifetime.abort();
      throw error;
    }
  }

  const auth = createMobileAuth(options.auth);
  let host: AuthHost | null = null;

  function authPanel(text: string, signal: AbortSignal, retry = false) {
    const panel = element('section');
    panel.className = 'workspace card';
    const title = element('h1', role === 'client' ? 'مساحة العميل' : 'مساحة الإدارة');
    const status = element('p', text);
    status.setAttribute('role', 'status');
    const action = element('button', retry ? 'إعادة المحاولة' : 'تسجيل الدخول الآمن');
    action.type = 'button';
    action.className = 'btn btn-primary';
    action.addEventListener(
      'click',
      () => {
        action.disabled = true;
        if (retry) {
          host?.retry();
          return;
        }
        void auth
          .signIn()
          .catch((error: unknown) => {
            status.textContent = message(error);
          })
          .finally(() => {
            action.disabled = false;
          });
      },
      { signal },
    );
    panel.append(title, status, action);
    if (retry) {
      const change = element('button', 'تغيير الحساب');
      change.type = 'button';
      change.addEventListener(
        'click',
        () => {
          void auth.signOut().catch((error: unknown) => {
            status.textContent = message(error);
          });
        },
        { signal },
      );
      panel.append(change);
    }
    root.replaceChildren(panel);
  }

  host = await attachAuthHost({
    auth,
    signedOut(session, signal) {
      authPanel(
        session.status === 'unavailable'
          ? 'تعذّر التحقق من الجلسة. تحقق من الاتصال ثم سجّل الدخول.'
          : 'سجّل الدخول بحساب الشركة المخصص لهذه المساحة.',
        signal,
      );
    },
    async mount(_session, signal) {
      const accessToken = async () => {
        if (signal.aborted) return null;
        const token = await auth.getAccessToken();
        return signal.aborted ? null : token;
      };
      root.replaceChildren(element('p', 'جارٍ التحقق من صلاحيات الحساب…'));
      await verify(accessToken, signal);
      if (signal.aborted) return () => {};
      const shell = element('section');
      const actions = element('header');
      const signOut = element('button', 'تسجيل الخروج');
      signOut.type = 'button';
      signOut.className = 'btn btn-secondary';
      const content = element('div');
      signOut.addEventListener(
        'click',
        () => {
          if (content.querySelector('form[aria-busy="true"]')) return;
          signOut.disabled = true;
          shell.inert = true;
          void auth
            .signOut()
            .then((result) => {
              if (!result.revoked) {
                const notice = root.querySelector('[role="status"]');
                if (notice)
                  notice.textContent = 'تم تسجيل الخروج محليًا؛ تعذّر تأكيد إلغاء الجلسة بالخادم.';
              }
            })
            .catch((error: unknown) => {
              if (!signal.aborted) authPanel(message(error), signal, true);
            })
            .finally(() => {
              if (!signal.aborted) {
                shell.inert = false;
                signOut.disabled = false;
              }
            });
        },
        { signal },
      );
      actions.append(signOut);
      shell.append(actions, content);
      root.replaceChildren(shell);
      return mountWorkspace({
        root: content,
        role,
        baseUrl: options.baseUrl,
        accessToken,
        signal,
      });
    },
    error(error, signal) {
      authPanel(message(error), signal, true);
    },
  });
  return async () => {
    try {
      await host?.dispose();
    } finally {
      root.replaceChildren();
    }
  };
}
