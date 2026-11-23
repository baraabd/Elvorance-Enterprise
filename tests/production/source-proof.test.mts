import test from 'node:test';
import assert from 'node:assert/strict';
import { gitBlob, verifyTrackedArchive } from '../../tooling/production/source-proof.mts';
const bytes = new TextEncoder().encode('export const value = 1;\n');
const source = { path: 'apps/example.ts', mode: '100644', sha: gitBlob(bytes) };
const contents = { 'Elvorance-Enterprise/apps/example.ts': bytes };
const canonical = (_path: string, data: Uint8Array) => gitBlob(data);
test('source package proof accepts exact tracked bytes including an empty file', () => {
  const empty = new Uint8Array();
  const result = verifyTrackedArchive(
    [source, { path: 'empty.ts', mode: '100644', sha: gitBlob(empty) }],
    { ...contents, 'Elvorance-Enterprise/empty.ts': empty },
    canonical,
  );
  assert.equal(result.status, 'PASS');
});
test('source package proof rejects missing or changed product source', () => {
  assert.equal(verifyTrackedArchive([source], {}, canonical).status, 'BLOCKED');
  assert.equal(
    verifyTrackedArchive(
      [source],
      { 'Elvorance-Enterprise/apps/example.ts': new Uint8Array() },
      canonical,
    ).status,
    'BLOCKED',
  );
});
test('source package proof accepts only Git-attribute-normalized matching blobs', () => {
  const windows = new TextEncoder().encode('export const value = 1;\r\n');
  const result = verifyTrackedArchive(
    [source],
    { 'Elvorance-Enterprise/apps/example.ts': windows },
    (_path, data) =>
      gitBlob(new TextEncoder().encode(new TextDecoder().decode(data).replaceAll('\r\n', '\n'))),
  );
  assert.equal(result.status, 'PASS');
  assert.equal(result.entries[0]?.disposition, 'attribute-normalized-source-bytes');
});
test('source package proof permits a changed parity report but never a missing one', () => {
  const parity = { ...source, path: 'tests/design-parity/artifacts/latest-results.json' };
  assert.equal(
    verifyTrackedArchive(
      [parity],
      { [`Elvorance-Enterprise/${parity.path}`]: new Uint8Array() },
      canonical,
    ).status,
    'PASS',
  );
  assert.equal(verifyTrackedArchive([parity], {}, canonical).status, 'BLOCKED');
});
test('source package proof does not exempt arbitrary generated-looking paths', () => {
  const report = { ...source, path: 'tests/design-parity/artifacts/other.ts' };
  assert.equal(
    verifyTrackedArchive(
      [report],
      { [`Elvorance-Enterprise/${report.path}`]: new Uint8Array() },
      canonical,
    ).status,
    'BLOCKED',
  );
});
test('source package proof rejects empty, duplicate and unsupported source trees', () => {
  assert.equal(verifyTrackedArchive([], contents, canonical).status, 'BLOCKED');
  assert.equal(verifyTrackedArchive([source, source], contents, canonical).status, 'BLOCKED');
  assert.equal(
    verifyTrackedArchive([{ ...source, mode: '120000' }], contents, canonical).status,
    'BLOCKED',
  );
  assert.equal(
    verifyTrackedArchive([{ ...source, path: '../escape' }], contents, canonical).status,
    'BLOCKED',
  );
});
