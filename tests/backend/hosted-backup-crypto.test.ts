import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  backupKey,
  encryptBackup,
  decryptBackup,
  fileDigest,
} from '../../infra/railway/staging/backup-crypto.mts';

const context = JSON.stringify({
  project: 'isolated-test',
  source: 'a'.repeat(40),
  database: 'fixture',
});
test('retained backup crypto validates key encodings without inventing or rotating a key', () => {
  const key = randomBytes(32);
  assert.deepEqual(backupKey(key.toString('hex')), key);
  assert.deepEqual(backupKey(key.toString('base64')), key);
  for (const value of [
    '',
    'not-a-key',
    'a'.repeat(63),
    'a'.repeat(65),
    Buffer.alloc(31).toString('base64'),
  ])
    assert.throws(() => backupKey(value));
});
test('retained backup encryption round-trips real bytes, uses fresh nonces and private files', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'elv-backup-crypto-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = randomBytes(32);
  const plain = join(directory, 'source.dump');
  const content = Buffer.concat([Buffer.from('PGDMP'), randomBytes(100000)]);
  await writeFile(plain, content, { mode: 0o600 });
  const first = await encryptBackup(plain, join(directory, 'one.enc'), key, context);
  const second = await encryptBackup(plain, join(directory, 'two.enc'), key, context);
  assert.notEqual(first.encrypted.sha256, second.encrypted.sha256);
  assert.deepEqual(first.plain, second.plain);
  assert.ok(!(await readFile(join(directory, 'one.enc'))).includes(content));
  const restored = await decryptBackup(
    join(directory, 'one.enc'),
    join(directory, 'restore.dump'),
    key,
    context,
  );
  assert.deepEqual(restored, first.plain);
  assert.deepEqual(await readFile(join(directory, 'restore.dump')), content);
  if (process.platform !== 'win32')
    assert.equal((await stat(join(directory, 'restore.dump'))).mode & 0o777, 0o600);
});
test('retained backup rejects tampering, foreign context, wrong keys and truncated input before restore', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'elv-backup-negative-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = randomBytes(32),
    plain = join(directory, 'source'),
    encrypted = join(directory, 'encrypted');
  await writeFile(plain, Buffer.from('PGDMP private data'), { mode: 0o600 });
  await encryptBackup(plain, encrypted, key, context);
  const original = await readFile(encrypted);
  const variants = [
    original.subarray(0, 10),
    Buffer.from(original),
    Buffer.from(original),
    Buffer.from(original),
  ];
  const headerVariant = variants[1],
    bodyVariant = variants[2],
    tagVariant = variants[3];
  assert.ok(headerVariant && bodyVariant && tagVariant);
  headerVariant[0] = 0;
  const position = bodyVariant.length - 17;
  bodyVariant[position] = (bodyVariant[position] ?? 0) ^ 1;
  tagVariant[tagVariant.length - 1] = (tagVariant.at(-1) ?? 0) ^ 1;
  for (const [index, bytes] of variants.entries()) {
    const candidate = join(directory, `bad-${index}`),
      output = join(directory, `output-${index}`);
    await writeFile(candidate, bytes, { mode: 0o600 });
    await assert.rejects(decryptBackup(candidate, output, key, context));
    await assert.rejects(stat(output));
  }
  await assert.rejects(
    decryptBackup(encrypted, join(directory, 'foreign'), key, 'foreign-context'),
  );
  await assert.rejects(
    decryptBackup(encrypted, join(directory, 'wrong-key'), randomBytes(32), context),
  );
  await assert.rejects(stat(join(directory, 'wrong-key')));
});
test('retained backup handles empty files and never overwrites an existing destination', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'elv-backup-empty-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = randomBytes(32),
    plain = join(directory, 'source'),
    encrypted = join(directory, 'encrypted'),
    output = join(directory, 'output');
  await writeFile(plain, '', { mode: 0o600 });
  await encryptBackup(plain, encrypted, key, context);
  assert.equal((await decryptBackup(encrypted, output, key, context)).bytes, 0);
  await writeFile(output, 'preserve me');
  await assert.rejects(decryptBackup(encrypted, output, key, context));
  assert.equal(await readFile(output, 'utf8'), 'preserve me');
  await assert.rejects(encryptBackup(plain, encrypted, key, context));
  assert.equal((await fileDigest(encrypted)).bytes > 0, true);
});
test('retained backup digest refuses symlinks and directories', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'elv-backup-files-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(fileDigest(directory));
  if (process.platform !== 'win32') {
    const file = join(directory, 'file'),
      link = join(directory, 'link');
    await writeFile(file, 'content');
    await symlink(file, link);
    await assert.rejects(fileDigest(link));
  }
});
