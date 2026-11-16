import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { applyHotfix } from '../../tooling/patches/apply-hotfix.mjs';

const fingerprints = (text) => {
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  return { sha256: hash(text), textSha256: hash(text.replaceAll('\r\n', '\n')) };
};

async function fixture(t) {
  const temporary = await mkdtemp(resolve(tmpdir(), 'atlas-hotfix-test-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const project = resolve(temporary, 'project');
  const patch = resolve(temporary, 'patch');
  const write = async (base, path, content) => {
    const file = resolve(base, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  };
  await write(
    project,
    'package.json',
    JSON.stringify({ name: 'atlas-crm-enterprise', version: '2.0.0' }),
  );
  await write(project, 'infra/compose/.env', 'unchanged local development settings');
  const files = [];
  for (const path of ['tooling/scripts/first.mjs', 'tooling/scripts/second.mjs']) {
    const before = `// previous ${path}\n`;
    const after = `// corrected ${path}\n`;
    await write(project, path, before.replaceAll('\n', '\r\n'));
    await write(patch, `files/${path}`, after);
    files.push({ path, before: fingerprints(before), after: fingerprints(after) });
  }
  await write(
    patch,
    'manifest.json',
    JSON.stringify({ schemaVersion: 1, release: '2.0.1', files }),
  );
  return { project, patch, files, write };
}

test('hotfix preflights CRLF sources, backs up originals and is idempotent without touching env', async (t) => {
  const state = await fixture(t);
  const firstPath = state.files[0].path;
  const original = await readFile(resolve(state.project, firstPath));
  const preflight = await applyHotfix({ ...state, check: true });
  assert.equal(preflight.pending, 2);
  assert.deepEqual(await readFile(resolve(state.project, firstPath)), original);
  const result = await applyHotfix(state);
  assert.equal(result.changed, 2);
  assert.deepEqual(await readFile(resolve(result.backup, 'files', firstPath)), original);
  assert.equal((await applyHotfix(state)).changed, 0);
  assert.equal(
    await readFile(resolve(state.project, 'infra/compose/.env'), 'utf8'),
    'unchanged local development settings',
  );
});

test('hotfix detects all local conflicts before changing any file', async (t) => {
  const state = await fixture(t);
  const firstPath = state.files[0].path;
  const original = await readFile(resolve(state.project, firstPath));
  await state.write(state.project, state.files[1].path, '// user changes');
  await assert.rejects(applyHotfix(state), /Local edits.*No files changed/s);
  assert.deepEqual(await readFile(resolve(state.project, firstPath)), original);
  assert.equal((await readdir(state.project)).includes('.atlas-backups'), false);
});

test('hotfix rejects damaged payloads and out-of-scope writes before applying', async (t) => {
  const state = await fixture(t);
  await state.write(state.patch, `files/${state.files[1].path}`, 'corrupted payload');
  await assert.rejects(applyHotfix(state), /checksum failed/);
  const manifest = { schemaVersion: 1, release: '2.0.1', files: [{ path: 'infra/compose/.env' }] };
  await state.write(state.patch, 'manifest.json', JSON.stringify(manifest));
  await assert.rejects(applyHotfix(state), /outside this hotfix scope/);
  assert.equal((await readdir(state.project)).includes('.atlas-backups'), false);
});
