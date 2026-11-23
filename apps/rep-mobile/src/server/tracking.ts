import { createMobilePlatform } from '@elvorance/mobile-platform';
import type { RepApi } from './api.ts';
import { idPath } from './api.ts';

interface Session {
  id: string;
  version: number;
  status: 'active' | 'paused' | 'stopped';
  deviceId: string;
  sequence: number;
}
type Platform = ReturnType<typeof createMobilePlatform>;
export interface TrackingSnapshot {
  collecting: boolean;
  status: string;
}

function deviceIdentifier(): string {
  // This random identifier contains no credentials or location. Storage restrictions must not
  // prevent the rest of the representative workspace from opening.
  try {
    const stored = localStorage.getItem('elvorance.device-id');
    if (stored && /^[a-f0-9-]{36}$/.test(stored)) return stored;
    const value = crypto.randomUUID();
    localStorage.setItem('elvorance.device-id', value);
    return value;
  } catch {
    return crypto.randomUUID();
  }
}

export class TrackingController {
  private session: Session | null = null;
  private stopWatch: (() => Promise<void>) | null = null;
  private pendingWatch: Promise<() => Promise<void>> | null = null;
  private listeners: (() => void | Promise<void>)[] = [];
  private queue: Promise<void> = Promise.resolve();
  private initialization: Promise<void> | null = null;
  private starting: Promise<void> | null = null;
  private readonly lifetime = new AbortController();
  private capture = new AbortController();
  private generation = 0;
  private collecting = false;
  private closed = false;
  private foreground = true;
  private online = true;
  private status = 'مشاركة الموقع متوقفة.';
  private readonly deviceId = deviceIdentifier();

  constructor(
    private readonly api: RepApi,
    private readonly notify: (snapshot: TrackingSnapshot) => void,
    private readonly platform: Platform = createMobilePlatform(),
  ) {}

  snapshot(): TrackingSnapshot {
    return { collecting: this.collecting, status: this.status };
  }

  private publish(status: string): void {
    this.status = status;
    if (!this.closed) this.notify(this.snapshot());
  }

  private serialize(operation: () => Promise<void>): Promise<void> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => {});
    return next;
  }

  private current(generation: number): boolean {
    return !this.closed && generation === this.generation && this.foreground && this.online;
  }

  private async register(register: () => Promise<() => void | Promise<void>>): Promise<void> {
    const remove = await register();
    if (this.closed) await remove();
    else this.listeners.push(remove);
  }

  initialize(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.initialization) return this.initialization;
    this.initialization = (async () => {
      this.online = (await this.platform.network()).connected;
      if (this.closed) return;
      this.foreground = document.visibilityState !== 'hidden';
      await this.register(() =>
        this.platform.onNetworkChange((network) => {
          if (this.closed) return;
          this.online = network.connected;
          if (!network.connected)
            void this.pause('توقفت مشاركة الموقع لانقطاع الاتصال.').catch(() => {
              this.publish('توقف الموقع محليًا؛ تعذّر تحديث حالة الجلسة بالخادم.');
            });
        }),
      );
      if (this.closed) return;
      await this.register(() =>
        this.platform.onActiveChange((active) => {
          if (this.closed) return;
          this.foreground = active;
          if (!active)
            void this.pause('توقفت مشاركة الموقع عند مغادرة التطبيق.').catch(() => {
              this.publish('توقف الموقع محليًا؛ تعذّر تحديث حالة الجلسة بالخادم.');
            });
        }),
      );
      if (this.closed) return;
      // Never resume GPS automatically after restart, permission change or sign-in.
      const current = await this.api.get<{ items: Session[] }>('/v1/tracking/sessions/current', {
        signal: this.lifetime.signal,
      });
      if (this.closed) return;
      this.session = current.items.find((session) => session.deviceId === this.deviceId) ?? null;
      if (this.session?.status === 'active')
        await this.pause('توجد جلسة سابقة؛ يلزم اختيار بدء المشاركة مجددًا.');
    })().catch(async (error: unknown) => {
      const removals = await Promise.allSettled(this.listeners.splice(0).map((remove) => remove()));
      this.initialization = null;
      if (this.closed) return;
      if (removals.some((result) => result.status === 'rejected')) {
        throw new Error('تعذّر إغلاق مراقبة حالة الجهاز. أغلق التطبيق وأعد المحاولة.');
      }
      throw error;
    });
    return this.initialization;
  }

  start(consent: boolean, repName: string): Promise<void> {
    if (consent !== true) return Promise.reject(new Error('وافق على مشاركة الموقع أولًا.'));
    if (this.starting) return this.starting;
    const requestedGeneration = this.generation;
    this.starting = this.startCapture(repName, requestedGeneration).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async startCapture(repName: string, requestedGeneration: number): Promise<void> {
    await this.initialize();
    if (this.closed || !this.foreground || !this.online)
      throw new Error('افتح التطبيق واتصل بالشبكة لبدء مشاركة الموقع.');
    // A pause/stop while session recovery is pending cancels this earlier consent request too.
    if (requestedGeneration !== this.generation) return;
    if (this.collecting) return;
    const generation = ++this.generation;
    this.capture.abort();
    this.capture = new AbortController();
    const signal = AbortSignal.any([this.lifetime.signal, this.capture.signal]);
    const permission = await this.platform.requestLocationPermission();
    if (!this.current(generation)) return;
    if (permission.location === 'denied')
      throw new Error('صلاحية الموقع مرفوضة. يمكنك تعديلها من إعدادات الجهاز.');
    await this.serialize(async () => {
      if (!this.current(generation)) return;
      if (this.session && this.session.status !== 'stopped') {
        const previous = await this.api.get<Session>(
          '/v1/tracking/sessions/' + idPath(this.session.id),
          { signal },
        );
        if (!this.current(generation)) return;
        this.session = previous;
        if (this.session.status === 'paused') await this.changeState('active', signal);
      }
      if (!this.current(generation)) return;
      if (!this.session || this.session.status === 'stopped') {
        const created = await this.api.mutate<Session>(
          'POST',
          '/v1/tracking/sessions',
          { consent: true, repName, deviceId: this.deviceId },
          signal,
        );
        if (!this.current(generation)) return;
        this.session = created;
      }
    });
    if (!this.current(generation)) return;
    this.collecting = true;
    try {
      const pending = this.platform.watchLocation({
        consent: true,
        onPosition: (position) => {
          if (!this.collecting || !this.current(generation)) return;
          void this.serialize(async () => {
            if (!this.session || !this.collecting || !this.current(generation)) return;
            const age = Date.now() - position.timestamp;
            // Drop old/future/invalid GPS readings; never persist or replay a coordinate backlog.
            if (
              !Number.isFinite(age) ||
              age > 25_000 ||
              age < -5_000 ||
              !Number.isFinite(position.coords.latitude) ||
              Math.abs(position.coords.latitude) > 90 ||
              !Number.isFinite(position.coords.longitude) ||
              Math.abs(position.coords.longitude) > 180 ||
              !Number.isFinite(position.coords.accuracy) ||
              position.coords.accuracy < 0
            )
              return;
            const session = this.session;
            const accepted = await this.api.mutate<{ version: number; acceptedSequence: number }>(
              'POST',
              '/v1/tracking/sessions/' + idPath(session.id) + '/points',
              {
                expectedVersion: session.version,
                deviceId: this.deviceId,
                sequence: session.sequence + 1,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                capturedAt: new Date(position.timestamp).toISOString(),
              },
              signal,
            );
            if (!this.current(generation) || this.session !== session) return;
            session.version = accepted.version;
            session.sequence = accepted.acceptedSequence;
            this.publish('مشاركة الموقع نشطة أثناء استخدام التطبيق.');
          }).catch(() => {
            if (this.current(generation))
              void this.pause(
                'تعذّر تأكيد الموقع. توقفت المشاركة؛ تحقق من الاتصال قبل الاستئناف.',
              ).catch(() => {
                this.publish('توقف الموقع محليًا؛ تعذّر تحديث حالة الجلسة بالخادم.');
              });
          });
        },
        onError: () => {
          if (this.current(generation))
            void this.pause('تعذّر الحصول على الموقع. تحقق من الصلاحية وإشارة GPS.').catch(() => {
              this.publish('توقف الموقع محليًا؛ تعذّر تحديث حالة الجلسة بالخادم.');
            });
        },
      });
      this.pendingWatch = pending;
      const stop = await pending;
      if (this.pendingWatch === pending) this.pendingWatch = null;
      if (!this.collecting || !this.current(generation)) await stop();
      else this.stopWatch = stop;
    } catch (error) {
      if (this.current(generation)) await this.pause('لم تبدأ مشاركة الموقع.');
      throw error;
    }
    if (this.collecting && this.current(generation)) this.publish('بانتظار قراءة موقع حديثة…');
  }

  private async stopLocal(): Promise<void> {
    ++this.generation;
    this.capture.abort();
    this.collecting = false;
    const stop = this.stopWatch;
    this.stopWatch = null;
    const pending = this.pendingWatch;
    this.pendingWatch = null;
    const outcomes = await Promise.allSettled([
      ...(stop ? [stop()] : []),
      ...(pending ? [pending.then((remove) => remove())] : []),
    ]);
    if (outcomes.some((result) => result.status === 'rejected'))
      throw new Error('تعذّر إغلاق مراقبة الموقع على الجهاز.');
  }

  private async changeState(
    state: 'active' | 'paused' | 'stopped',
    signal = this.lifetime.signal,
  ): Promise<void> {
    const session = this.session;
    if (
      this.closed ||
      signal.aborted ||
      !session ||
      session.status === state ||
      session.status === 'stopped'
    )
      return;
    const result = await this.api.mutate<{ version: number; status: Session['status'] }>(
      'POST',
      '/v1/tracking/sessions/' + idPath(session.id) + '/state',
      { expectedVersion: session.version, state, deviceId: this.deviceId },
      signal,
    );
    if (this.closed || signal.aborted || this.session !== session) return;
    session.version = result.version;
    session.status = result.status;
  }

  async pause(message = 'مشاركة الموقع متوقفة مؤقتًا.'): Promise<void> {
    await this.stopLocal();
    this.publish(message);
    if (this.closed || !this.online) return;
    await this.serialize(async () => {
      if (this.closed) return;
      if (this.session)
        this.session = await this.api.get<Session>(
          '/v1/tracking/sessions/' + idPath(this.session.id),
          { signal: this.lifetime.signal },
        );
      await this.changeState('paused');
    });
  }

  async stop(): Promise<void> {
    await this.stopLocal();
    this.publish('مشاركة الموقع متوقفة على الجهاز.');
    if (this.closed || !this.online) return;
    await this.serialize(async () => {
      if (this.closed) return;
      if (this.session)
        this.session = await this.api.get<Session>(
          '/v1/tracking/sessions/' + idPath(this.session.id),
          { signal: this.lifetime.signal },
        );
      await this.changeState('stopped');
      this.publish('تم إنهاء جلسة الموقع وحذف آخر إحداثياتها من الخدمة.');
    });
  }

  async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.lifetime.abort();
    const cleanup = await Promise.allSettled([
      this.stopLocal(),
      ...this.listeners.splice(0).map((remove) => remove()),
      ...(this.initialization ? [this.initialization] : []),
    ]);
    if (cleanup.some((result) => result.status === 'rejected'))
      throw new Error('تعذّر إغلاق أحد موارد الموقع على الجهاز.');
  }
}
