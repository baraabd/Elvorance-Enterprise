import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom') as typeof import('jsdom');
import {
  csvCell,
  downloadCsv,
  rowsCsv,
  snapshotCsv,
} from '../../apps/admin-web/src/server/export.ts';
import type { Row } from '../../apps/admin-web/src/server/api.ts';

const row: Row = {
  id: 'export-1',
  tenantId: 'private-tenant',
  version: 1,
  createdAt: '2026-11-28T00:00:00.000Z',
  updatedAt: '2026-11-28T00:00:00.000Z',
  name: '=HYPERLINK("https://example.invalid","click")',
  contractSnapshot: { secret: 'must-not-be-exported' },
  accessToken: 'must-not-be-exported',
};
test('CSV exports quote delimiters and formula-like text without interpreting it', () => {
  for (const text of [
    '=1+1',
    '+1+1',
    '-1+1',
    '@SUM(1)',
    '  =1',
    '\t=1',
    '\rhello',
    '\nhello',
    '\uFEFF=1',
    '＝1',
    '＋1',
    '－1',
    '＠SUM(1)',
  ])
    assert.ok(csvCell(text).startsWith('"\''), text);
  assert.equal(csvCell('اسم, عربي "آمن"'), '"اسم, عربي ""آمن"""');
  assert.equal(csvCell(-12), '"-12"');
  assert.equal(csvCell(null), '""');
  assert.throws(() => csvCell(Number.NaN));
  assert.throws(() => csvCell(Number.POSITIVE_INFINITY));
});
test('CSV row export is explicit about page scope and excludes unlisted or nested fields', () => {
  const text = rowsCsv('customers', [row], 'current-page');
  assert.ok(text.startsWith('\uFEFF'));
  assert.ok(text.includes('"current-page"'));
  assert.ok(text.includes('"\'=HYPERLINK('));
  assert.ok(!text.includes('must-not-be-exported'));
  assert.ok(!text.includes('private-tenant'));
  assert.equal(text.match(/\r\n/g)?.length, 2);
  assert.throws(() =>
    rowsCsv(
      'customers',
      Array.from({ length: 10001 }, () => row),
      'bounded-all-pages',
    ),
  );
  assert.throws(() => rowsCsv('customers', [{ ...row, name: { hidden: 'data' } }], 'current-page'));
});
test('CSV reports separate currency, record capture time and disclose their observation scope', () => {
  const value = {
    capturedAt: '2026-11-28T00:00:00.000Z',
    metrics: [{ resource: 'customers' as const, count: 2, states: { new: 2 } }],
    invoices: {
      SAR: { amountMinor: 1000, paidMinor: 200, outstandingMinor: 800 },
      USD: { amountMinor: 500, paidMinor: 500, outstandingMinor: 0 },
    },
  };
  const text = snapshotCsv(value);
  assert.ok(text.includes('bounded-current-operational-observation-not-accounting-revenue'));
  assert.ok(text.includes('"SAR","800"'));
  assert.ok(text.includes('"USD","0"'));
  assert.throws(() => snapshotCsv({ ...value, capturedAt: 'invalid' }));
});
test('CSV download uses a local object URL, a constrained filename, and releases its resource', async () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  const revoked: string[] = [];
  let clicked = 0;
  dom.window.URL.createObjectURL = () => 'blob:isolated-test';
  dom.window.URL.revokeObjectURL = (url) => {
    revoked.push(url);
  };
  dom.window.HTMLAnchorElement.prototype.click = function () {
    clicked++;
    assert.equal(this.download, 'elvorance-customers.csv');
    assert.equal(this.href, 'blob:isolated-test');
  };
  downloadCsv(dom.window.document, 'elvorance-customers.csv', 'safe');
  assert.equal(clicked, 1);
  assert.equal(dom.window.document.querySelectorAll('a').length, 0);
  assert.throws(() => downloadCsv(dom.window.document, '../secrets.csv', 'safe'));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(revoked, ['blob:isolated-test']);
  dom.window.close();
});
