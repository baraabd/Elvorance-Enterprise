// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/* Explicit baseline regeneration only. Normal parity tests do not read v1.1 source. */
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {
  directory,
  workspace,
  clock,
  randomSeed,
  appNames,
  clone,
  hash,
  createSurface,
  executeScript,
  settle,
  snapshot,
  applyFixture,
  canonicalAppCss,
  writeJson,
} from './harness.mts';

const option = process.argv.indexOf('--reference');
if (option < 0 || !process.argv[option + 1])
  throw new Error(
    'Usage: node tests/design-parity/generate-baseline.mjs --reference /path/to/reviewed-v1.1-repository',
  );
const reference = path.resolve(process.argv[option + 1]);
const sourcePaths = [
  'src/shared/icons.js',
  'src/shared/seed.js',
  'src/shared/core.js',
  'src/shared/tracking.js',
  ...Object.keys(appNames).map((app) => `src/apps/${app}.js`),
];
const source = Object.fromEntries(
  await Promise.all(
    sourcePaths.map(async (file) => [file, await fs.readFile(path.join(reference, file), 'utf8')]),
  ),
);

function extractedCss(app) {
  const name = app === 'admin' ? 'css' : 'styles';
  const tree = ts.createSourceFile(
    app + '.js',
    source[`src/apps/${app}.js`],
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  let css;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isNoSubstitutionTemplateLiteral(node.initializer)
    )
      css = node.initializer.text;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  if (typeof css !== 'string') throw new Error('Expected one static CSS literal in v1.1 ' + app);
  return canonicalAppCss(css);
}
function boot(surface, app) {
  for (const file of sourcePaths.filter((file) => file.startsWith('src/shared/')))
    executeScript(surface, source[file], file);
  const register = surface.w.Elvorance.register;
  surface.w.Elvorance.register = (definition) => {
    surface.w.ElvoranceParityDefinition = definition;
    register(definition);
  };
  executeScript(surface, source[`src/apps/${app}.js`], `src/apps/${app}.js`);
  surface.w.Elvorance.start(app);
}
const seedSurface = createSurface();
executeScript(seedSurface, source['src/shared/seed.js'], 'reference-seed');
const seedState = clone(seedSurface.w.ElvoranceSeed());
seedSurface.close();

const quote = clone(seedState.quotes.find((row) => row.id === 'quote-1'));
quote.visitId = 'visit-1';
quote.version = 1;
quote.items = quote.items.map((item) => {
  const svc = seedState.catalog.find((row) => row.id === item.serviceId);
  return {
    ...item,
    features: clone(svc.features || []),
    deliverables: clone(svc.deliverables || []),
    duration: svc.duration,
    unit: svc.unit,
  };
});
quote.baseTerms = quote.terms;
quote.proposedDuration = '6 أسابيع بعد استلام المحتوى';
quote.paymentWishes = 'دفعتان مرتبطتان بالبدء والتسليم';
quote.terms +=
  '\n\nمدة التنفيذ المقترحة: ' +
  quote.proposedDuration +
  '\n\nتفضيلات الدفع المقترحة، وتؤكد نهائيًا في العقد: ' +
  quote.paymentWishes;
quote.scopeSnapshot = {
  version: 1,
  capturedAt: clock,
  items: clone(quote.items),
  terms: quote.terms,
  proposedDuration: quote.proposedDuration,
  paymentWishes: quote.paymentWishes,
};
const working = {
  needs: quote.items.map((item) => item.serviceId),
  painPoints: 'تجميع الطلبات وتحسين حضور النشاط الرقمي',
  wishes: 'تجربة واضحة للعملاء وخطوات تنفيذ قابلة للمراجعة',
  proposedDuration: quote.proposedDuration,
  paymentWishes: quote.paymentWishes,
  notes: 'نوقش النطاق وأُرسل العرض، ولم يُسجل قبول العميل بعد.',
};
const activeVisit = {
  status: 'active',
  startedAt: '2027-02-10T11:40:00.000Z',
  endedAt: null,
  locationProof: {
    method: 'manual',
    reason: 'Fixture يدوي صريح؛ لا توجد قراءة GPS فعلية.',
    recordedAt: '2027-02-10T11:40:00.000Z',
  },
  workingDraft: working,
  notes: working.notes,
  quoteIds: [quote.id],
  opportunityIds: [quote.opportunityId],
};
const subtotal = quote.items.reduce(
  (total, item) => total + Number(item.qty) * Number(item.price),
  0,
);
const quoteSnapshot = {
  id: quote.id,
  visitId: quote.visitId,
  opportunityId: quote.opportunityId,
  title: quote.title,
  status: quote.status,
  acceptedAt: null,
  rejectedAt: null,
  revisionRequest: '',
  validUntil: quote.validUntil,
  items: clone(quote.items),
  subtotal,
  discount: Number(quote.discount),
  total: Math.round((subtotal - Number(quote.discount)) * 100) / 100,
  terms: quote.terms,
  proposedDuration: quote.proposedDuration,
  paymentWishes: quote.paymentWishes,
  notes: quote.notes || '',
  scopeSnapshot: clone(quote.scopeSnapshot),
  version: 1,
};
const agreement = {
  schemaVersion: 1,
  visitId: 'visit-1',
  clientId: quote.clientId,
  repId: quote.repId,
  capturedAt: '2027-02-10T11:55:00.000Z',
  reviewResult: 'sent',
  outcome: 'interested',
  primaryQuoteId: quote.id,
  quotes: [quoteSnapshot],
  quoteIds: [quote.id],
  opportunityIds: [quote.opportunityId],
  needs: {
    ...clone(working),
    services: quote.items.map((item) => ({ serviceId: item.serviceId, title: item.title })),
  },
  notes: working.notes,
  nextAction: 'انتظار قرار العميل على العرض المرسل',
  followUpAt: null,
  clientAcceptance: {
    status: 'not_accepted',
    quoteId: quote.id,
    recordedAt: null,
    source: 'client_quote_status',
    contractSigned: null,
    paymentRecorded: null,
    downstreamStatus: 'review_separate_records',
  },
};
const fixtures = {
  default: {},
  activeVisit: {
    visits: { 'visit-1': activeVisit },
    quotes: { [quote.id]: quote },
    opportunities: { [quote.opportunityId]: { visitId: 'visit-1', visitIds: ['visit-1'] } },
  },
  completedVisit: {
    visits: {
      'visit-1': {
        ...clone(activeVisit),
        status: 'completed',
        endedAt: agreement.capturedAt,
        outcome: 'interested',
        reviewResult: 'sent',
        agreementSnapshot: agreement,
        nextAction: agreement.nextAction,
      },
    },
    quotes: { [quote.id]: quote },
  },
};
const baseParams = {
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
    deliverable: seedState.projects.find((row) => row.id === 'project-1').deliverables[0].id,
  },
  'invoice-detail': { id: seedState.invoices.find((row) => row.clientId === 'client-1').id },
  'ticket-detail': { id: seedState.tickets.find((row) => row.clientId === 'client-1').id },
  'team-member': { id: 'rep-1' },
  'zone-detail': { id: 'zone-1' },
  conversation: { id: 'client-1' },
};
const baseline = {
  schemaVersion: 1,
  reference: {
    label: 'Elvorance v1.1',
    sourceSha256: Object.fromEntries(sourcePaths.map((file) => [file, hash(source[file])])),
    generatedAt: new Date().toISOString(),
    node: process.version,
    icu: process.versions.icu,
  },
  determinism: {
    clock,
    randomSeed,
    timezone: 'UTC',
    tracking:
      'read-only in-memory status/empty-locations fixtures; no GPS, server or browser process',
  },
  normalization: {
    dom: 'Remove style elements from a cloned #app only. Preserve all text, attributes, values, IDs, SVG content, route/action hooks and document title.',
    appCss:
      'Remove the original enclosing style tag, then trim file-boundary whitespace only. Preserve every internal CSS byte and rule order.',
    sharedCssAndFonts: 'Exact byte SHA-256 comparison; no normalization.',
  },
  seedState,
  fixtures,
  apps: {},
  cases: [],
  assets: [],
};
for (const app of Object.keys(appNames)) {
  const metadataSurface = createSurface({ app, state: seedState });
  boot(metadataSurface, app);
  await settle(metadataSurface);
  const definition = metadataSurface.w.ElvoranceParityDefinition;
  baseline.apps[app] = {
    routes: Object.keys(definition.routes),
    actions: Object.keys(definition.actions),
    nav: clone(definition.nav),
  };
  if (metadataSurface.logs.length) throw new Error(JSON.stringify(metadataSurface.logs));
  metadataSurface.close();
  for (const route of baseline.apps[app].routes) {
    const fixture =
      app === 'rep' && ['visit-active', 'visit-outcome'].includes(route)
        ? 'activeVisit'
        : app === 'rep' && route === 'visit-detail'
          ? 'completedVisit'
          : 'default';
    const params = baseParams[route] || {},
      surface = createSurface({
        app,
        route,
        params,
        state: applyFixture(seedState, fixtures[fixture]),
      });
    try {
      boot(surface, app);
      await settle(surface);
      const captured = snapshot(surface);
      if (surface.logs.length) throw new Error(`${app}/${route}: ${JSON.stringify(surface.logs)}`);
      baseline.cases.push({
        id: app + '/' + route,
        app,
        route,
        params,
        fixture,
        title: captured.title,
        html: captured.html,
        sha256: hash(captured.html),
        iconsHash: captured.iconsHash,
      });
    } finally {
      surface.close();
    }
  }
  baseline.assets.push({
    id: app + '-app-css',
    kind: 'app-css',
    target: `apps/${appNames[app]}/src/styles.css`,
    source: `src/apps/${app}.js CSS literal`,
    sha256: hash(extractedCss(app)),
  });
}
for (const file of ['styles.css', 'polish.css', 'tracking.css'])
  baseline.assets.push({
    id: 'shared-' + file,
    kind: 'shared-css',
    target: 'packages/design-system/src/' + file,
    source: 'src/shared/' + file,
    sha256: hash(await fs.readFile(path.join(reference, 'src/shared', file))),
  });
for (const file of ['NotoSansArabic-Regular.woff', 'NotoSansArabic-Bold.woff', 'LICENSE.txt'])
  baseline.assets.push({
    id: file,
    kind: file.endsWith('.woff') ? 'font' : 'font-license',
    target: 'packages/design-system/fonts/' + file,
    source: 'src/shared/fonts/' + file,
    sha256: hash(await fs.readFile(path.join(reference, 'src/shared/fonts', file))),
  });
if (
  baseline.cases.length !== 64 ||
  Object.values(baseline.apps).reduce((sum, app) => sum + app.actions.length, 0) !== 122
)
  throw new Error('The reviewed v1.1 baseline must contain 64 routes and 122 app actions.');
await writeJson(path.join(directory, 'baseline-v1.1.json'), baseline);
console.log(
  JSON.stringify({
    baseline: 'tests/design-parity/baseline-v1.1.json',
    cases: baseline.cases.length,
    actions: 122,
    assets: baseline.assets.length,
    bytes: Buffer.byteLength(JSON.stringify(baseline)),
    reference: path.relative(workspace, reference),
  }),
);
