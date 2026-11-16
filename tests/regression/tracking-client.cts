// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/* Migrated v1.1 regression cases: sources are generated from the CURRENT modular workspaces, never the old application code. */
/* GPS and same-origin API are mocked. No real position, device key or network is
 * exposed. Run after npm install: node tests/tracking-client.cjs. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '../../dist/test-adapters');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const storageKey = 'elvorance.tracking.device.v1';
const checks = [],
  contexts = [];

function service() {
  const clock = { now: Date.now() },
    sessions = [],
    calls = [];
  let serial = 0;
  const api = {
    clock,
    sessions,
    calls,
    unavailable: false,
    networkFailure: false,
    outOfOrderNext: false,
    deferPoint: false,
    releasePoint: null,
    deferLocations: false,
    releaseLocations: null,
  };
  const answer = (value, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(JSON.stringify(value)),
  });
  const reject = (code, message, status) => answer({ code, message }, status);
  function publicRow(row) {
    const status =
      row.state === 'active'
        ? !row.point
          ? 'waiting'
          : clock.now - row.point.capturedAt <= 45000 && clock.now - row.heartbeat <= 45000
            ? 'live'
            : 'stale'
        : row.state;
    return {
      sessionId: row.id,
      repId: row.repId,
      repName: row.repName,
      status,
      latitude: row.point?.latitude ?? null,
      longitude: row.point?.longitude ?? null,
      accuracy: row.point?.accuracy ?? null,
      capturedAt: row.point ? new Date(row.point.capturedAt).toISOString() : null,
      receivedAt: row.point ? new Date(row.heartbeat).toISOString() : null,
      lastHeartbeat: new Date(row.heartbeat).toISOString(),
      startedAt: new Date(row.startedAt).toISOString(),
      expiresAt: new Date(row.expiresAt).toISOString(),
      errorCode: row.errorCode || null,
      sequence: row.sequence,
    };
  }
  api.fetch = async (url, options = {}) => {
    const pathname = new URL(url, 'https://elvorance-tracking.test').pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({
      path: pathname,
      method: options.method || 'GET',
      body,
      headers: options.headers || {},
    });
    assert.ok(pathname.startsWith('/api/tracking/'), 'Unexpected external fetch');
    if (api.networkFailure) throw new TypeError('Network unavailable');
    if (api.unavailable)
      return reject('database_unavailable', 'خدمة الموقع غير مهيأة على هذا العنوان.', 503);
    if (pathname.endsWith('/status'))
      return answer({
        available: true,
        staleAfterMs: 45000,
        serverNow: new Date(clock.now).toISOString(),
      });
    if (pathname.endsWith('/locations')) {
      const latest = new Map();
      sessions
        .slice()
        .reverse()
        .forEach((row) => {
          if (!latest.has(row.repId)) latest.set(row.repId, publicRow(row));
        });
      const response = answer({
        locations: [...latest.values()],
        serverNow: new Date(clock.now).toISOString(),
        staleAfterMs: 45000,
      });
      if (api.deferLocations) {
        api.deferLocations = false;
        return new Promise((resolve) => {
          api.releaseLocations = () => resolve(response);
        });
      }
      return response;
    }
    const key = (options.headers?.Authorization || '').replace(/^Bearer /, '');
    if (pathname === '/api/tracking/sessions') {
      if (!/^[a-f0-9]{64}$/.test(key) || body.consent !== true)
        return reject('consent_required', 'أكد الموافقة.', 400);
      const sameKey = sessions.find((row) => row.key === key);
      if (sameKey) {
        if (sameKey.state === 'stopped')
          return reject('device_conflict', 'استخدم جلسة جديدة.', 409);
        return answer({ session: publicRow(sameKey), resumed: true });
      }
      if (sessions.some((row) => row.repId === body.repId && row.state !== 'stopped'))
        return reject(
          'already_tracking',
          'لهذا المندوب جلسة على جهاز آخر. أوقفها من لوحة المتابعة قبل بدء جلسة جديدة.',
          409,
        );
      const row = {
        id: 'track-session-' + ++serial,
        key,
        repId: body.repId,
        repName: body.repName,
        state: 'active',
        sequence: 0,
        point: null,
        startedAt: clock.now,
        expiresAt: clock.now + 8 * 3600000,
        heartbeat: clock.now,
      };
      sessions.push(row);
      return answer({ session: publicRow(row) }, 201);
    }
    if (pathname.endsWith('/admin/stop')) {
      sessions
        .filter((row) => row.repId === body.repId)
        .forEach((row) => {
          row.state = 'stopped';
          row.point = null;
          row.heartbeat = clock.now;
        });
      return answer({ ok: true });
    }
    const match = /\/sessions\/([\w-]+)\/(point|state)$/.exec(pathname);
    const row = match && sessions.find((item) => item.id === match[1] && item.key === key);
    if (!row || row.state === 'stopped' || row.expiresAt <= clock.now)
      return reject('session_expired', 'انتهت جلسة الموقع؛ ابدأ مشاركة جديدة.', 401);
    if (match[2] === 'state') {
      if (body.state === 'active' && ['paused', 'error'].includes(row.state)) row.point = null;
      row.state = body.state;
      row.errorCode = body.errorCode || null;
      row.heartbeat = clock.now;
      if (body.state === 'stopped') row.point = null;
      return answer({ ok: true, state: row.state });
    }
    if (row.state === 'paused') return reject('session_paused', 'الجلسة متوقفة مؤقتًا.', 409);
    if (api.outOfOrderNext) {
      api.outOfOrderNext = false;
      row.sequence = 50;
      row.point = { ...body, capturedAt: clock.now };
      return answer({ accepted: false, code: 'out_of_order', session: publicRow(row) });
    }
    if (body.sequence <= row.sequence || (row.point && body.capturedAt < row.point.capturedAt))
      return answer({ accepted: false, code: 'out_of_order', session: publicRow(row) });
    row.point = body;
    row.sequence = body.sequence;
    row.heartbeat = clock.now;
    row.state = 'active';
    const response = answer({ accepted: true, session: publicRow(row) });
    if (api.deferPoint) {
      api.deferPoint = false;
      return new Promise((resolve) => {
        api.releasePoint = () => resolve(response);
      });
    }
    return response;
  };
  return api;
}

async function create(api, options = {}) {
  const errors = [],
    console = new VirtualConsole();
  console.on('error', (...args) => errors.push(args.map(String).join(' ')));
  console.on('jsdomError', (error) => errors.push(String(error)));
  const role = options.role || 'rep';
  const dom = new JSDOM(
    '<!doctype html><html lang="ar" dir="rtl"><head></head><body><div id="app"></div></body></html>',
    {
      url: options.url || 'https://elvorance-tracking.test/' + role + '.html',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole: console,
    },
  );
  // JSDOM does not expose structuredClone even when Node.js does.
  // Provide the standard API in this isolated test window before app startup.
  dom.window.structuredClone = structuredClone;
  const w = dom.window,
    flags = { online: true, visible: true },
    intervals = new Map();
  let timerId = 0,
    watcherId = 0;
  const OriginalDate = w.Date;
  w.Date = class extends OriginalDate {
    constructor(...args) {
      super(...(args.length ? args : [api.clock.now]));
    }
    static now() {
      return api.clock.now;
    }
  };
  w.scrollTo = () => {};
  w.fetch = api.fetch;
  Object.defineProperty(w, 'isSecureContext', {
    value: options.secure !== false,
    configurable: true,
  });
  Object.defineProperty(w.navigator, 'onLine', { get: () => flags.online, configurable: true });
  Object.defineProperty(w.document, 'visibilityState', {
    get: () => (flags.visible ? 'visible' : 'hidden'),
    configurable: true,
  });
  w.setInterval = (fn, ms) => {
    intervals.set(++timerId, { fn, ms });
    return timerId;
  };
  w.clearInterval = (id) => intervals.delete(id);
  const geo = {
    watches: new Map(),
    pending: [],
    watchCalls: 0,
    getCalls: 0,
    clearCalls: 0,
    options: [],
  };
  Object.defineProperty(w.navigator, 'geolocation', {
    value: {
      watchPosition(success, error, opts) {
        geo.watchCalls++;
        geo.options.push(opts);
        geo.watches.set(++watcherId, { success, error });
        return watcherId;
      },
      clearWatch(id) {
        geo.clearCalls++;
        geo.watches.delete(id);
      },
      getCurrentPosition(success, error, opts) {
        geo.getCalls++;
        geo.options.push(opts);
        geo.pending.push({ success, error });
      },
    },
    configurable: true,
  });
  if (options.saved) w.sessionStorage.setItem(storageKey, options.saved);
  for (const file of ['src/shared/icons.js', 'src/shared/seed.js', 'src/shared/core.js'])
    w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  const holder =
    role === 'admin'
      ? '<div data-elvorance-live-team' +
        (options.rep ? ' data-rep="' + options.rep + '"' : '') +
        (options.hidden ? ' hidden' : '') +
        '></div>'
      : '<div data-elvorance-tracking-control></div>';
  w.Elvorance.register({
    id: role,
    name: 'اختبار الموقع',
    home: 'home',
    nav: [{ id: 'home', label: 'الرئيسية', icon: 'home' }],
    routes: {
      home: { title: 'الموقع', render: () => holder },
      other: { title: 'صفحة أخرى', render: () => '<p>صفحة دون متابعة</p>' },
    },
    actions: {},
  });
  w.Elvorance.start(role);
  w.eval(fs.readFileSync(path.join(root, 'src/shared/tracking.js'), 'utf8'));
  await pause(25);
  const ctx = {
    w,
    dom,
    api,
    flags,
    geo,
    intervals,
    errors,
    async tick(ms, advance = ms) {
      api.clock.now += advance;
      for (const item of [...intervals.values()].filter((item) => item.ms === ms)) await item.fn();
      await pause(20);
    },
    async read(latitude = 36.2, longitude = 37.15, timestamp = api.clock.now, accuracy = 12) {
      const callback = geo.pending.shift() || [...geo.watches.values()].at(-1);
      assert.ok(callback, 'No active GPS request');
      callback.success({ timestamp, coords: { latitude, longitude, accuracy } });
      await pause(20);
    },
    async gpsError(code) {
      const callback = geo.pending.shift() || [...geo.watches.values()].at(-1);
      assert.ok(callback, 'No active GPS request');
      callback.error({ code });
      await pause(20);
    },
    async visible(value) {
      flags.visible = value;
      w.document.dispatchEvent(new w.Event('visibilitychange'));
      await pause(20);
    },
    async online(value) {
      flags.online = value;
      w.dispatchEvent(new w.Event(value ? 'online' : 'offline'));
      await pause(20);
    },
  };
  contexts.push(ctx);
  return ctx;
}
const $ = (ctx, selector) => {
  const node = ctx.w.document.querySelector(selector);
  assert.ok(node, 'Missing control ' + selector);
  return node;
};
async function click(ctx, action) {
  $(ctx, '[data-track-action="' + action + '"]').dispatchEvent(
    new ctx.w.MouseEvent('click', { bubbles: true, cancelable: true }),
  );
  await pause(25);
}
async function consentStart(ctx) {
  const checkbox = $(ctx, '[data-tracking-consent]');
  checkbox.checked = true;
  checkbox.dispatchEvent(new ctx.w.Event('change', { bubbles: true }));
  await click(ctx, 'start');
}
const pointCalls = (api) => api.calls.filter((call) => call.path.endsWith('/point'));
const controlStatus = (ctx) => $(ctx, '[data-elvorance-tracking-control] .tracking-badge').className;
async function check(name, fn) {
  const from = contexts.length;
  try {
    const evidence = await fn();
    assert.deepEqual(
      contexts.slice(from).flatMap((ctx) => ctx.errors),
      [],
    );
    checks.push({ name, status: 'passed', evidence });
    console.log('PASS ' + name);
  } catch (error) {
    checks.push({ name, status: 'failed', message: error.message, stack: error.stack });
    console.error('FAIL ' + name + ': ' + error.message);
  } finally {
    contexts.slice(from).forEach((ctx) => ctx.w.close());
  }
}

async function main() {
  await check('Mount and unchecked start never request GPS or create a session', async () => {
    const api = service(),
      ctx = await create(api);
    assert.equal(ctx.geo.watchCalls, 0);
    assert.equal(ctx.geo.getCalls, 0);
    assert.equal(api.sessions.length, 0);
    await click(ctx, 'start');
    assert.equal(ctx.geo.watchCalls, 0);
    assert.equal(api.sessions.length, 0);
    assert.ok($(ctx, '.tracking-message').textContent.includes('موافقتك'));
  });
  await check(
    'Consented start creates a 64-hex device key and waits for actual coordinates',
    async () => {
      const api = service(),
        ctx = await create(api);
      await consentStart(ctx);
      const saved = JSON.parse(ctx.w.sessionStorage.getItem(storageKey));
      assert.match(saved.key, /^[a-f0-9]{64}$/);
      assert.equal(saved.sequence, 0);
      assert.equal(api.sessions.length, 1);
      assert.equal(ctx.geo.watchCalls, 1);
      assert.equal(ctx.geo.getCalls, 1);
      assert.equal(pointCalls(api).length, 0);
      assert.ok(controlStatus(ctx).includes('tracking-waiting'));
      assert.ok(
        ctx.geo.options.every(
          (option) => option.maximumAge === 0 && option.enableHighAccuracy === true,
        ),
      );
    },
  );
  await check(
    'First GPS point uploads the actual accuracy, timestamp and sequence; later flush sends only latest point',
    async () => {
      const api = service(),
        ctx = await create(api);
      await consentStart(ctx);
      await ctx.read(36.201, 37.151, api.clock.now, 8);
      assert.equal(pointCalls(api).length, 1);
      assert.ok(controlStatus(ctx).includes('tracking-live'));
      const watch = [...ctx.geo.watches.values()][0];
      api.clock.now += 1000;
      watch.success({
        timestamp: api.clock.now,
        coords: { latitude: 36.202, longitude: 37.152, accuracy: 9 },
      });
      api.clock.now += 1000;
      watch.success({
        timestamp: api.clock.now,
        coords: { latitude: 36.203, longitude: 37.153, accuracy: 10 },
      });
      await pause(10);
      assert.equal(pointCalls(api).length, 1);
      await ctx.tick(5000);
      const calls = pointCalls(api);
      assert.equal(calls.length, 2);
      assert.equal(calls[1].body.latitude, 36.203);
      assert.equal(calls[1].body.accuracy, 10);
      assert.equal(calls[1].body.sequence, 2);
      assert.ok(calls[1].body.capturedAt < api.clock.now);
      return { actualCoordinatesOnly: true, sequences: calls.map((call) => call.body.sequence) };
    },
  );
  await check(
    'Stationary devices explicitly refresh GPS every 15 seconds and do not resend an old timestamp as fresh',
    async () => {
      const api = service(),
        ctx = await create(api);
      await consentStart(ctx);
      await ctx.read();
      const old = pointCalls(api)[0].body.capturedAt;
      await ctx.tick(15000);
      assert.equal(ctx.geo.getCalls, 2);
      await ctx.read(36.2, 37.15);
      await ctx.tick(5000);
      assert.equal(pointCalls(api).length, 2);
      assert.ok(pointCalls(api)[1].body.capturedAt > old);
      await ctx.tick(5000);
      assert.equal(pointCalls(api).length, 2);
    },
  );
  await check(
    'Old GPS readings are not uploaded and out-of-order callbacks cannot reverse location',
    async () => {
      const api = service(),
        ctx = await create(api);
      await consentStart(ctx);
      await ctx.read(36.2, 37.15, api.clock.now - 60000);
      assert.equal(pointCalls(api).length, 0);
      assert.ok(controlStatus(ctx).includes('tracking-stale'));
      await ctx.read();
      const count = pointCalls(api).length;
      await ctx.read(5, 5, api.clock.now - 1000);
      await ctx.tick(5000);
      assert.equal(pointCalls(api).length, count);
      assert.equal(api.sessions[0].point.latitude, 36.2);
    },
  );
  await check(
    'Server out-of-order response advances local sequence before the next real reading',
    async () => {
      const api = service(),
        ctx = await create(api);
      await consentStart(ctx);
      api.outOfOrderNext = true;
      await ctx.read();
      assert.equal(JSON.parse(ctx.w.sessionStorage.getItem(storageKey)).sequence, 50);
      api.clock.now += 2000;
      await ctx.read(36.21, 37.16);
      assert.equal(pointCalls(api).at(-1).body.sequence, 51);
      assert.ok(controlStatus(ctx).includes('tracking-live'));
    },
  );
  await check(
    'Hidden and offline states clear GPS; visible ongoing consent resumes into waiting for a fresh reading',
    async () => {
      const api = service(),
        ctx = await create(api);
      await consentStart(ctx);
      await ctx.read();
      const old = [...ctx.geo.watches.values()][0];
      await ctx.visible(false);
      assert.equal(ctx.geo.watches.size, 0);
      assert.equal(api.sessions[0].state, 'paused');
      assert.equal(api.sessions[0].errorCode, 'hidden');
      const count = pointCalls(api).length;
      old.success({
        timestamp: api.clock.now + 1,
        coords: { latitude: 1, longitude: 1, accuracy: 5 },
      });
      await pause(10);
      assert.equal(pointCalls(api).length, count);
      await ctx.visible(true);
      assert.equal(ctx.geo.watches.size, 1);
      assert.ok(controlStatus(ctx).includes('tracking-waiting'));
      assert.equal(api.sessions[0].point, null);
      await ctx.online(false);
      assert.equal(ctx.geo.watches.size, 0);
      await ctx.online(true);
      assert.equal(ctx.geo.watches.size, 1);
    },
  );
  await check(
    'Reload restores session and sequence but never auto-starts GPS or rechecks consent',
    async () => {
      const api = service(),
        first = await create(api);
      await consentStart(first);
      await first.read();
      await first.visible(false);
      const saved = first.w.sessionStorage.getItem(storageKey),
        second = await create(api, { saved });
      assert.equal(second.geo.watchCalls, 0);
      assert.equal(second.geo.getCalls, 0);
      assert.equal($(second, '[data-tracking-consent]').checked, false);
      assert.ok($(second, '[data-track-action="start"]').textContent.includes('استئناف'));
      await second.visible(false);
      await second.visible(true);
      assert.equal(second.geo.watchCalls, 0);
      await consentStart(second);
      assert.equal(api.sessions.length, 1);
      api.clock.now += 3000;
      await second.read();
      assert.equal(pointCalls(api).at(-1).body.sequence, 2);
    },
  );
  await check('Permission denial stops GPS and requires an explicit new resume', async () => {
    const api = service(),
      ctx = await create(api);
    await consentStart(ctx);
    await ctx.gpsError(1);
    assert.equal(ctx.geo.watches.size, 0);
    assert.equal(api.sessions[0].state, 'error');
    assert.equal(api.sessions[0].errorCode, 'permission_denied');
    assert.ok($(ctx, '.tracking-message').textContent.includes('إذن الموقع'));
    const count = ctx.geo.watchCalls;
    await ctx.visible(false);
    await ctx.visible(true);
    await ctx.online(true);
    assert.equal(ctx.geo.watchCalls, count);
  });
  await check(
    'GPS timeout is visible and a subsequent real reading can recover without a fabricated point',
    async () => {
      const api = service(),
        ctx = await create(api);
      await consentStart(ctx);
      await ctx.gpsError(3);
      assert.equal(pointCalls(api).length, 0);
      assert.ok(controlStatus(ctx).includes('tracking-error'));
      await ctx.tick(15000);
      await ctx.read();
      assert.equal(pointCalls(api).length, 1);
      assert.ok(controlStatus(ctx).includes('tracking-live'));
    },
  );
  await check(
    'Stop clears GPS and server coordinates; an in-flight old response cannot restore live status',
    async () => {
      const api = service(),
        ctx = await create(api);
      await consentStart(ctx);
      api.deferPoint = true;
      await ctx.read();
      assert.ok(api.releasePoint);
      await click(ctx, 'stop');
      assert.equal(ctx.geo.watches.size, 0);
      assert.equal(api.sessions[0].state, 'stopped');
      assert.equal(api.sessions[0].point, null);
      api.releasePoint();
      await pause(20);
      assert.ok(controlStatus(ctx).includes('tracking-stopped'));
      assert.equal(ctx.w.sessionStorage.getItem(storageKey), null);
      assert.equal($(ctx, '[data-tracking-consent]').checked, false);
    },
  );
  await check(
    'Offline stop remains pending for server confirmation and retries online without restarting GPS',
    async () => {
      const api = service(),
        ctx = await create(api);
      await consentStart(ctx);
      await ctx.read();
      await ctx.online(false);
      await click(ctx, 'stop');
      assert.equal(ctx.geo.watches.size, 0);
      assert.ok(JSON.parse(ctx.w.sessionStorage.getItem(storageKey)).pendingStop);
      assert.ok($(ctx, '.tracking-message').textContent.includes('لم يؤكد'));
      const count = ctx.geo.watchCalls;
      await ctx.online(true);
      assert.equal(ctx.geo.watchCalls, count);
      assert.equal(api.sessions[0].state, 'stopped');
      assert.equal(ctx.w.sessionStorage.getItem(storageKey), null);
    },
  );
  await check('Static files and unavailable API never claim live or start GPS', async () => {
    const api = service();
    api.unavailable = true;
    const hosted = await create(api);
    assert.ok(controlStatus(hosted).includes('tracking-unavailable'));
    await consentStart(hosted);
    assert.equal(hosted.geo.watchCalls, 0);
    const local = await create(service(), { url: 'file:///demo/rep.html' });
    assert.ok(controlStatus(local).includes('tracking-unavailable'));
    await consentStart(local);
    assert.equal(local.geo.watchCalls, 0);
    assert.equal(local.api.calls.length, 0);
  });
  await check(
    'Admin displays only server GPS data, local coordinate map and an optional unrequested OSM link',
    async () => {
      const api = service(),
        device = await create(api);
      await consentStart(device);
      await device.read(36.25, 37.18, api.clock.now, 17);
      const admin = await create(api, { role: 'admin' });
      assert.equal(admin.geo.watchCalls, 0);
      assert.equal(admin.w.document.querySelectorAll('.tracking-person').length, 1);
      assert.ok($(admin, '.tracking-selected').textContent.includes('36.250000'));
      assert.ok($(admin, '.tracking-selected').textContent.includes('17'));
      assert.ok($(admin, 'a[href^="https://www.openstreetmap.org/"]').href.includes('36.25'));
      assert.ok(api.calls.every((call) => call.path.startsWith('/api/tracking/')));
    },
  );
  await check(
    'Admin marks old readings stale and drops all live labels when the latest fetch fails',
    async () => {
      const api = service(),
        device = await create(api);
      await consentStart(device);
      await device.read();
      const admin = await create(api, { role: 'admin' });
      assert.ok(admin.w.document.querySelector('.tracking-live'));
      await admin.tick(5000, 50000);
      assert.ok(admin.w.document.querySelector('.tracking-stale'));
      assert.equal(admin.w.document.querySelectorAll('.tracking-live').length, 0);
      api.networkFailure = true;
      await admin.tick(5000);
      assert.ok($(admin, '.tracking-admin-summary').textContent.includes('0'));
      assert.equal(admin.w.document.querySelectorAll('.tracking-live').length, 0);
      assert.ok(admin.w.document.querySelector('.tracking-unavailable'));
    },
  );
  await check(
    'A delayed locations response cannot make an aged coordinate live again',
    async () => {
      const api = service(),
        device = await create(api);
      await consentStart(device);
      await device.read();
      const admin = await create(api, { role: 'admin' });
      api.deferLocations = true;
      const pending = admin.tick(5000, 1000);
      await pause(15);
      assert.ok(api.releaseLocations);
      await admin.tick(5000, 50000);
      assert.equal(admin.w.document.querySelectorAll('.tracking-live').length, 0);
      api.releaseLocations();
      await pending;
      assert.equal(admin.w.document.querySelectorAll('.tracking-live').length, 0);
      assert.ok(admin.w.document.querySelector('.tracking-stale'));
    },
  );
  await check(
    'Two logical devices cannot share one rep until admin confirms stop; old device then expires',
    async () => {
      const api = service(),
        first = await create(api);
      await consentStart(first);
      await first.read();
      const second = await create(api);
      await consentStart(second);
      assert.equal(second.geo.watchCalls, 0);
      assert.ok($(second, '.tracking-message').textContent.includes('جهاز آخر'));
      const admin = await create(api, { role: 'admin' });
      const stopCount = api.calls.filter((call) => call.path.endsWith('/admin/stop')).length;
      await click(admin, 'admin-stop');
      assert.equal(api.calls.filter((call) => call.path.endsWith('/admin/stop')).length, stopCount);
      $(admin, '[data-action="confirm-action"]').click();
      await pause(25);
      assert.equal(api.sessions[0].state, 'stopped');
      await consentStart(second);
      assert.equal(second.geo.watchCalls, 1);
      assert.equal(api.sessions.length, 2);
      assert.notEqual(api.sessions[0].key, api.sessions[1].key);
      api.clock.now += 3000;
      await first.read();
      await first.tick(5000);
      assert.equal(first.geo.watches.size, 0);
      assert.ok(controlStatus(first).includes('tracking-stopped'));
      return {
        distinctLogicalDevices: 2,
        adminConfirmationRequired: true,
        oldSessionRevoked: true,
      };
    },
  );
  await check(
    'Admin polling stops when hidden or after navigating away from its placeholder',
    async () => {
      const api = service(),
        admin = await create(api, { role: 'admin' });
      await admin.visible(false);
      const count = api.calls.filter((call) => call.path.endsWith('/locations')).length;
      await admin.tick(5000);
      assert.equal(api.calls.filter((call) => call.path.endsWith('/locations')).length, count);
      await admin.visible(true);
      await pause(15);
      admin.w.Elvorance.go('other');
      await pause(20);
      const away = api.calls.filter((call) => call.path.endsWith('/locations')).length;
      await admin.tick(5000);
      assert.equal(api.calls.filter((call) => call.path.endsWith('/locations')).length, away);
      const hidden = await create(service(), { role: 'admin', hidden: true });
      assert.equal(hidden.api.calls.length, 0);
    },
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    const summary = {
      passed: checks.filter((check) => check.status === 'passed').length,
      failed: checks.filter((check) => check.status === 'failed').length,
      checks,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failed) process.exitCode = 1;
  });
