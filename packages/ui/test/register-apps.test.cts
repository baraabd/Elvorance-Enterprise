// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/* Registration and route smoke checks for the real ESM features and runtime.
 * Build in memory, execute in JSDOM, and use synthetic local state only.
 * No browser process, network, or native plugin is required.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { JSDOM, VirtualConsole } = require('jsdom');
const workspace = process.cwd();
const expected = {
  rep: {
    dir: 'rep-mobile',
    routes: [
      'home',
      'territory',
      'clients',
      'client-form',
      'client-detail',
      'visit-checkin',
      'visit-active',
      'visit-outcome',
      'visit-detail',
      'catalog',
      'service-detail',
      'opportunities',
      'opportunity-detail',
      'quote-builder',
      'quotes',
      'quote-detail',
      'tasks',
      'messages',
      'more',
      'profile',
    ],
    actions: 51,
  },
  client: {
    dir: 'client-mobile',
    routes: [
      'home',
      'services',
      'service-detail',
      'request-service',
      'requests',
      'quotes',
      'quote-detail',
      'contracts',
      'contract-detail',
      'projects',
      'project-detail',
      'deliverable-detail',
      'invoices',
      'invoice-detail',
      'support',
      'new-ticket',
      'ticket-detail',
      'messages',
      'account',
      'profile',
      'preferences',
    ],
    actions: 28,
  },
  admin: {
    dir: 'admin-web',
    routes: [
      'home',
      'team',
      'live-tracking',
      'team-member',
      'territories',
      'zone-detail',
      'clients',
      'client-detail',
      'pipeline',
      'opportunity',
      'tasks',
      'approvals',
      'projects',
      'project-detail',
      'analytics',
      'invoices',
      'invoice-detail',
      'support',
      'ticket-detail',
      'messages',
      'conversation',
      'settings',
      'more',
    ],
    actions: 43,
  },
};
// Resolve workspace exports directly so this check also works before symlinks
// are installed. This is test-only; production uses normal package exports.
const aliases = {};
for (const folder of fs.readdirSync(path.join(workspace, 'packages'))) {
  const dir = path.join(workspace, 'packages', folder),
    manifestPath = path.join(dir, 'package.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const exports =
    typeof manifest.exports === 'string' ? { '.': manifest.exports } : manifest.exports || {};
  for (const [subpath, target] of Object.entries(exports))
    if (typeof target === 'string' && !subpath.includes('*'))
      aliases[manifest.name + (subpath === '.' ? '' : subpath.slice(1))] = path.join(dir, target);
}
const resolveWorkspace = {
  name: 'local-workspace-exports',
  setup(build) {
    build.onResolve({ filter: /^@elvorance\// }, (args) =>
      aliases[args.path] ? { path: aliases[args.path] } : undefined,
    );
  },
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function routeParams(role, route, state) {
  const rows = {
    'client-detail': { id: 'client-1' },
    'client-form': { id: 'client-1' },
    'visit-checkin': { id: 'client-1', visit: 'visit-1' },
    'visit-active': { id: 'visit-1' },
    'visit-outcome': { id: 'visit-1' },
    'visit-detail': { id: 'visit-1' },
    'service-detail': { id: 'svc-security' },
    'request-service': { id: 'svc-security' },
    'opportunity-detail': { id: 'opp-1' },
    opportunity: { id: 'opp-1' },
    'quote-detail': { id: 'quote-1' },
    'quote-builder': { id: 'quote-3' },
    'contract-detail': { id: 'contract-1' },
    'project-detail': { id: 'project-1' },
    'deliverable-detail': {
      id: 'project-1',
      project: 'project-1',
      deliverable: state.projects[0]?.deliverables[0]?.id,
    },
    'invoice-detail': { id: state.invoices.find((row) => row.clientId === 'client-1')?.id },
    'ticket-detail': { id: state.tickets.find((row) => row.clientId === 'client-1')?.id },
    'team-member': { id: 'rep-1' },
    'zone-detail': { id: 'zone-1' },
    conversation: { id: 'client-1' },
  };
  return rows[route] || {};
}
async function verify(role, spec) {
  const entry = `import { installRuntime } from ${JSON.stringify(path.join(workspace, 'packages/app-runtime/src/index.ts'))};\nimport { registerApp } from ${JSON.stringify(path.join(workspace, 'apps', spec.dir, 'src/app.ts'))};\nconst runtime = installRuntime();\nwindow.ElvoranceAppDefinition = registerApp(runtime);\nruntime.start(${JSON.stringify(role)});`;
  const bundle = await esbuild.build({
    stdin: { contents: entry, resolveDir: workspace, sourcefile: role + '-registration.js' },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    plugins: [resolveWorkspace],
    logLevel: 'silent',
  });
  const failures = [],
    vc = new VirtualConsole();
  vc.on('jsdomError', (error) => failures.push(String(error)));
  vc.on('error', (...args) => failures.push(args.map(String).join(' ')));
  const dom = new JSDOM(
    '<!doctype html><html dir="rtl" lang="ar"><body><div id="app"></div></body></html>',
    {
      url: 'https://elvorance-modules.test/' + role + '/',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: vc,
    },
  );
  const w = dom.window;
  w.scrollTo = () => {};
  w.structuredClone = globalThis.structuredClone;
  try {
    const script = w.document.createElement('script');
    script.textContent = bundle.outputFiles[0].text;
    w.document.head.append(script);
    assert.ok(w.ElvoranceAppDefinition, role + ' registerApp did not register a definition');
    const definition = w.ElvoranceAppDefinition;
    assert.ok(spec.routes.every((route) => Object.hasOwn(definition.routes, route)), `${role}: baseline routes missing; current=${Object.keys(definition.routes)}`);
    assert.ok(Object.keys(definition.actions).length >= spec.actions, `${role}: action count regressed below ${spec.actions}`);
    assert.ok(Object.values(definition.actions).every((fn) => typeof fn === 'function'));
    w.Elvorance.update((s) => {
      const v = s.visits.find((row) => row.id === 'visit-1');
      if (role === 'rep') {
        v.status = 'active';
        v.startedAt = new Date().toISOString();
        v.locationProof = { method: 'manual', reason: 'Synthetic registration smoke fixture' };
      }
    });
    for (const route of spec.routes) {
      w.Elvorance.go(route, routeParams(role, route, w.Elvorance.state()));
      await pause(10);
      const content = w.document.querySelector('#main-content');
      assert.ok(content?.textContent.trim(), role + '/' + route + ' rendered no content');
      assert.ok(
        !content.textContent.includes('تعذر عرض هذه الصفحة'),
        role + '/' + route + ' failed to render',
      );
    }
    assert.deepEqual(failures, [], role + ' logged runtime errors');
    return {
      app: role,
      routes: spec.routes.length,
      actions: spec.actions,
      renderedRoutes: spec.routes.length,
      errors: failures,
    };
  } finally {
    w.close();
  }
}
Promise.all(Object.entries(expected).map(([role, spec]) => verify(role, spec)))
  .then((results) => {
    console.log(
      JSON.stringify(
        {
          method: 'Bundled ESM registerApp + extracted runtime in JSDOM',
          routes: results.reduce((sum, r) => sum + r.routes, 0),
          actions: results.reduce((sum, r) => sum + r.actions, 0),
          results,
        },
        null,
        2,
      ),
    );
  })
  .catch((error) => {
    console.error(error.stack);
    process.exitCode = 1;
  });
