import type { AuthSessionSnapshot, MobileAuth } from './types.ts';

type Cleanup = () => void | Promise<void>;

export interface AuthHostOptions {
  auth: MobileAuth;
  /** Clear account-owned caches synchronously before starting another account's screen. */
  onReset?: () => void;
  signedOut(session: AuthSessionSnapshot, signal: AbortSignal): void;
  mount(session: AuthSessionSnapshot, signal: AbortSignal): Promise<Cleanup>;
  error(error: unknown, signal: AbortSignal): void;
}

export interface AuthHost {
  retry(): void;
  dispose(): Promise<void>;
}

/** Reusable account lifecycle for native and web shells. Newer account/logout events always win. */
export async function attachAuthHost(options: AuthHostOptions): Promise<AuthHost> {
  let revision = 0;
  let closed = false;
  let subject: string | null = null;
  let cleanup: Cleanup | null = null;
  let screen = new AbortController();
  let latest: AuthSessionSnapshot = { status: 'signed-out', subject: null, expiresAt: null };

  function render(session: AuthSessionSnapshot, force = false): void {
    if (closed || session.status === 'signing-in' || session.status === 'refreshing') return;
    if (
      !force &&
      session.status === 'authenticated' &&
      session.subject &&
      subject === session.subject
    )
      return;
    const requestedRevision = ++revision;
    screen.abort();
    screen = new AbortController();
    const signal = screen.signal;
    const previous = cleanup;
    cleanup = null;
    subject = null;
    const current = () => !closed && requestedRevision === revision && !signal.aborted;
    const work = async () => {
      options.onReset?.();
      await previous?.();
      if (!current()) return;
      if (session.status !== 'authenticated' || !session.subject) {
        options.signedOut(session, signal);
        return;
      }
      subject = session.subject;
      const remove = await options.mount(session, signal);
      if (!current()) await remove();
      else cleanup = remove;
    };
    void work().catch((error: unknown) => {
      if (!current()) return;
      subject = null;
      options.error(error, signal);
    });
  }

  try {
    await options.auth.initialize();
  } catch (error) {
    options.error(error, screen.signal);
  }
  const unsubscribe = options.auth.onSessionChanged((session) => {
    latest = session;
    render(session);
  });
  return {
    retry() {
      render(latest, true);
    },
    async dispose() {
      if (closed) return;
      closed = true;
      ++revision;
      unsubscribe();
      screen.abort();
      subject = null;
      const remove = cleanup;
      cleanup = null;
      options.onReset?.();
      try {
        await remove?.();
      } finally {
        await options.auth.dispose();
      }
    },
  };
}
