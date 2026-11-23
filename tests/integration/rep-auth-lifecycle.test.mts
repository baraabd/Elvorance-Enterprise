import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const directory = resolve('dist/tests/rep-auth-lifecycle');
await mkdir(directory, { recursive: true });
await build({
  entryPoints: {
    bootstrap: 'apps/rep-mobile/src/server/bootstrap.ts',
    tracking: 'apps/rep-mobile/src/server/tracking.ts',
    'authenticated-workspace': 'packages/api-client/src/authenticated-workspace.ts',
  },
  outdir: directory,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outExtension: { '.js': '.mjs' },
});
const { startRepresentative } = await import(
  pathToFileURL(resolve(directory, 'bootstrap.mjs')).href
);
const { TrackingController } = await import(pathToFileURL(resolve(directory, 'tracking.mjs')).href);
const { mountAuthenticatedWorkspace } = await import(
  pathToFileURL(resolve(directory, 'authenticated-workspace.mjs')).href
);

function deferred() {
  let resolvePromise;
  let reject;
  const promise = new Promise((yes, no) => {
    resolvePromise = yes;
    reject = no;
  });
  return { promise, resolve: resolvePromise, reject };
}
const tick = () => new Promise((resolvePromise) => setImmediate(resolvePromise));

function dom() {
  const instance = new JSDOM('<main id="app"></main>', {
    url: 'https://rep.staging.example/',
    pretendToBeVisual: true,
  });
  const previous = new Map();
  for (const name of [
    'window',
    'document',
    'localStorage',
    'HTMLElement',
    'CustomEvent',
    'history',
    'AbortController',
    'AbortSignal',
  ]) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: instance.window[name],
    });
  }
  return {
    root: instance.window.document.querySelector('#app'),
    close() {
      instance.window.close();
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

const signedOut = { status: 'signed-out', subject: null, expiresAt: null };
const signedIn = (subject) => ({
  status: 'authenticated',
  subject,
  expiresAt: Date.now() + 60_000,
});
function auth(initial = signedOut) {
  let session = initial;
  let listener = () => {};
  return {
    async initialize() {
      return session;
    },
    async signIn() {
      return session;
    },
    async getAccessToken() {
      return session.subject ? 'test-access' : null;
    },
    async signOut() {
      session = signedOut;
      listener(session);
      return { revoked: true };
    },
    onSessionChanged(fn) {
      listener = fn;
      fn(session);
      return () => {
        listener = () => {};
      };
    },
    async dispose() {},
    emit(next) {
      session = next;
      listener(session);
    },
  };
}
const config = {
  dataMode: 'server',
  apiBaseUrl: 'https://api.staging.example',
  environment: 'staging',
  auth: {
    environment: 'staging',
    issuer: 'https://identity.staging.example/realms/elvorance-staging',
    clientId: 'elvorance-rep-staging',
    redirectUri: 'com.elvorance.rep.staging:/oauth2redirect',
  },
};

test('a newer logout wins over an account switch waiting for native cleanup', async () => {
  const view = dom();
  const identity = auth(signedIn('account-a'));
  const cleanup = deferred();
  let mounts = 0;
  try {
    const dispose = await startRepresentative(view.root, config, {
      createAuth: () => identity,
      createApi: () => ({ clear() {} }),
      async mountWorkspace(root) {
        mounts++;
        root.textContent = 'Authenticated workspace';
        return () => cleanup.promise;
      },
    });
    await tick();
    assert.equal(mounts, 1);
    identity.emit(signedIn('account-b'));
    identity.emit(signedOut);
    await tick();
    assert.match(view.root.textContent, /تسجيل الدخول الآمن/);
    cleanup.resolve();
    await tick();
    assert.equal(mounts, 1);
    assert.match(view.root.textContent, /تسجيل الدخول الآمن/);
    await dispose();
  } finally {
    view.close();
  }
});

test('a workspace completing after logout is immediately disposed', async () => {
  const view = dom();
  const identity = auth(signedIn('account-a'));
  const mounted = deferred();
  let removed = 0;
  try {
    const dispose = await startRepresentative(view.root, config, {
      createAuth: () => identity,
      createApi: () => ({ clear() {} }),
      async mountWorkspace() {
        await mounted.promise;
        return async () => {
          removed++;
        };
      },
    });
    await tick();
    identity.emit(signedOut);
    mounted.resolve();
    await tick();
    assert.equal(removed, 1);
    assert.match(view.root.textContent, /تسجيل الدخول الآمن/);
    await dispose();
  } finally {
    view.close();
  }
});

function trackingPorts() {
  let currentSession = null;
  const mutations = [];
  const api = {
    async get(path) {
      return path.endsWith('/current')
        ? { items: currentSession ? [currentSession] : [] }
        : { ...currentSession };
    },
    async mutate(method, path, body) {
      mutations.push({ method, path, body });
      if (path.endsWith('/sessions')) {
        currentSession = {
          id: 'session-1',
          version: 1,
          status: 'active',
          sequence: 0,
          deviceId: body.deviceId,
        };
        return { ...currentSession };
      }
      if (path.endsWith('/state')) {
        currentSession = {
          ...currentSession,
          version: currentSession.version + 1,
          status: body.state,
        };
        return { version: currentSession.version, status: currentSession.status };
      }
      return { version: currentSession.version + 1, acceptedSequence: body.sequence };
    },
  };
  const platform = {
    async network() {
      return { connected: true, connectionType: 'wifi' };
    },
    async onNetworkChange() {
      return async () => {};
    },
    async onActiveChange() {
      return async () => {};
    },
    async requestLocationPermission() {
      return { location: 'granted' };
    },
    async watchLocation() {
      return async () => {};
    },
  };
  return { api, platform, mutations };
}

test('disposing during native listener registration removes the late handle without reading account data', async () => {
  const view = dom();
  const ports = trackingPorts();
  const entered = deferred();
  const registered = deferred();
  let removed = 0;
  let reads = 0;
  ports.platform.onNetworkChange = async () => {
    entered.resolve();
    return registered.promise;
  };
  ports.api.get = async () => {
    reads++;
    return { items: [] };
  };
  const controller = new TrackingController(ports.api, () => {}, ports.platform);
  try {
    const initializing = controller.initialize();
    await entered.promise;
    const disposing = controller.dispose();
    registered.resolve(async () => {
      removed++;
    });
    await Promise.all([initializing, disposing]);
    assert.equal(removed, 1);
    assert.equal(reads, 0);
    assert.equal(controller.snapshot().collecting, false);
  } finally {
    view.close();
  }
});

test('stop while a location permission prompt is pending prevents session creation and GPS collection', async () => {
  const view = dom();
  const ports = trackingPorts();
  const entered = deferred();
  const permission = deferred();
  let watches = 0;
  ports.platform.requestLocationPermission = async () => {
    entered.resolve();
    return permission.promise;
  };
  ports.platform.watchLocation = async () => {
    watches++;
    return async () => {};
  };
  const controller = new TrackingController(ports.api, () => {}, ports.platform);
  try {
    const starting = controller.start(true, 'Representative');
    await entered.promise;
    await controller.stop();
    permission.resolve({ location: 'granted' });
    await starting;
    assert.equal(watches, 0);
    assert.equal(ports.mutations.length, 0);
    await controller.dispose();
  } finally {
    view.close();
  }
});

test('stop waits for a pending GPS subscription handle and rejects readings delivered after cancellation', async () => {
  const view = dom();
  const ports = trackingPorts();
  const entered = deferred();
  const subscription = deferred();
  let position;
  let removed = 0;
  let alreadyStopped = false;
  ports.platform.watchLocation = async (options) => {
    position = options.onPosition;
    entered.resolve();
    return subscription.promise;
  };
  const controller = new TrackingController(ports.api, () => {}, ports.platform);
  try {
    const starting = controller.start(true, 'Representative');
    await entered.promise;
    const stopping = controller.stop();
    position({ timestamp: Date.now(), coords: { latitude: 25, longitude: 45, accuracy: 4 } });
    subscription.resolve(async () => {
      if (!alreadyStopped) {
        alreadyStopped = true;
        removed++;
      }
    });
    await Promise.all([starting, stopping]);
    assert.equal(removed, 1);
    assert.equal(
      ports.mutations.some((mutation) => mutation.path.endsWith('/points')),
      false,
    );
    assert.equal(controller.snapshot().collecting, false);
    await controller.dispose();
  } finally {
    view.close();
  }
});

test('cleanup attempts every native listener even when one removal fails', async () => {
  const view = dom();
  const ports = trackingPorts();
  let removals = 0;
  ports.platform.onNetworkChange = async () => async () => {
    removals++;
    throw new Error('Native failure');
  };
  ports.platform.onActiveChange = async () => async () => {
    removals++;
  };
  const controller = new TrackingController(ports.api, () => {}, ports.platform);
  try {
    await controller.initialize();
    await assert.rejects(controller.dispose());
    assert.equal(removals, 2);
  } finally {
    view.close();
  }
});

test('web shells fail closed without OIDC or a valid explicit external provider', async () => {
  const view = dom();
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('Unexpected request');
  };
  try {
    await assert.rejects(
      mountAuthenticatedWorkspace({
        root: view.root,
        role: 'client',
        baseUrl: 'https://api.staging.example',
      }),
    );
    await assert.rejects(
      mountAuthenticatedWorkspace({
        root: view.root,
        role: 'client',
        baseUrl: 'https://api.staging.example',
        externalAccessToken: async () => null,
      }),
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previousFetch;
    view.close();
  }
});

test('web shells preserve an explicit external provider and verify its customer role before mounting', async () => {
  const view = dom();
  const previousFetch = globalThis.fetch;
  let role = 'client';
  globalThis.fetch = async (resource, options) => {
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer external-test-token');
    const path = new URL(String(resource)).pathname;
    if (path === '/v1/identity/me')
      return Response.json({
        principal: {
          sub: 'customer-1',
          roles: [role],
          tenantId: 'tenant-1',
          clientId: 'customer-1',
        },
        profile: null,
      });
    if (path === '/v1/billing/invoices') return Response.json({ items: [] });
    throw new Error('Unexpected API path');
  };
  try {
    const dispose = await mountAuthenticatedWorkspace({
      root: view.root,
      role: 'client',
      baseUrl: 'https://api.staging.example',
      externalAccessToken: async () => 'external-test-token',
    });
    assert.match(view.root.textContent, /الفواتير/);
    await dispose();
    assert.equal(view.root.textContent, '');
    const legacy = await mountAuthenticatedWorkspace({
      root: view.root,
      role: 'client',
      baseUrl: 'http://127.0.0.1:3000',
      externalAccessToken: async () => 'external-test-token',
    });
    assert.match(view.root.textContent, /الفواتير/);
    await legacy();
    await assert.rejects(
      mountAuthenticatedWorkspace({
        root: view.root,
        role: 'client',
        environment: 'staging',
        baseUrl: 'http://127.0.0.1:3000',
        externalAccessToken: async () => 'external-test-token',
      }),
    );
    role = 'rep';
    await assert.rejects(
      mountAuthenticatedWorkspace({
        root: view.root,
        role: 'client',
        baseUrl: 'https://api.staging.example',
        externalAccessToken: async () => 'external-test-token',
      }),
      (error) => error.status === 403,
    );
    assert.equal(view.root.textContent, '');
  } finally {
    globalThis.fetch = previousFetch;
    view.close();
  }
});

test('native approximate location is accepted without escalating to precise GPS', async () => {
  const view = dom();
  const ports = trackingPorts();
  ports.platform.native = true;
  ports.platform.requestLocationPermission = async () => ({
    location: 'denied',
    coarseLocation: 'granted',
  });
  let capture;
  ports.platform.watchLocation = async (options) => {
    capture = options;
    return async () => {};
  };
  const controller = new TrackingController(ports.api, () => {}, ports.platform);
  try {
    await controller.start(true, 'Representative');
    assert.equal(capture.enableHighAccuracy, false);
    capture.onPosition({
      timestamp: Date.now(),
      coords: { latitude: 25, longitude: 45, accuracy: 3000 },
    });
    await tick();
    assert.match(controller.snapshot().status, /التقريبي/);
    assert.equal(ports.mutations.filter((row) => row.path.endsWith('/points')).length, 1);
    await controller.dispose();
  } finally {
    view.close();
  }
});

test('consent refusal and unresolved native permission cannot create a tracking session', async () => {
  const view = dom();
  const ports = trackingPorts();
  ports.platform.native = true;
  let requests = 0;
  ports.platform.requestLocationPermission = async () => {
    requests++;
    return { location: 'prompt' };
  };
  const controller = new TrackingController(ports.api, () => {}, ports.platform);
  try {
    await assert.rejects(controller.start(false, 'Representative'));
    assert.equal(requests, 0);
    await assert.rejects(controller.start(true, 'Representative'));
    assert.equal(requests, 1);
    assert.equal(ports.mutations.length, 0);
    assert.equal(controller.snapshot().collecting, false);
    await controller.dispose();
  } finally {
    view.close();
  }
});

test('network loss clears GPS and reconnection neither resumes nor replays late readings', async () => {
  const view = dom();
  const ports = trackingPorts();
  let networkChanged;
  let position;
  let watches = 0;
  let removals = 0;
  ports.platform.onNetworkChange = async (callback) => {
    networkChanged = callback;
    return async () => {};
  };
  ports.platform.watchLocation = async (options) => {
    watches++;
    position = options.onPosition;
    return async () => {
      removals++;
    };
  };
  const controller = new TrackingController(ports.api, () => {}, ports.platform);
  try {
    await controller.start(true, 'Representative');
    networkChanged({ connected: false });
    position({ timestamp: Date.now(), coords: { latitude: 25, longitude: 45, accuracy: 5 } });
    await tick();
    networkChanged({ connected: true });
    await tick();
    assert.equal(controller.snapshot().collecting, false);
    assert.equal(removals, 1);
    assert.equal(watches, 1);
    assert.equal(
      ports.mutations.some((row) => row.path.endsWith('/points')),
      false,
    );
    await controller.dispose();
  } finally {
    view.close();
  }
});
