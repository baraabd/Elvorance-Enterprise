// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs, {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { copyContent } from '../../tooling/scripts/copy-content.mts';

test('content copy preserves bytes from read-only sources without copying modes or calling chmod', async (t) => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'elvorance-content-copy-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = resolve(temporary, 'source/config.js');
  const target = resolve(temporary, 'output/config.js');
  await mkdir(resolve(temporary, 'source/nested'), { recursive: true });
  await writeFile(source, 'window.ELVORANCE_CONFIG = { label: "إلفورانس" };\r\n');
  await writeFile(resolve(temporary, 'source/nested/font.bin'), Buffer.from([0, 128, 255, 13, 10]));
  await chmod(source, 0o444);
  const sourceMode = (await stat(source)).mode;
  // Reproduce the rejected permission operations from the Windows report. Content copying
  // must remain usable when permission propagation itself is prohibited by the filesystem.
  const denied = () => {
    throw Object.assign(new Error('EPERM: operation not permitted, chmod'), { code: 'EPERM' });
  };
  t.mock.method(fs, 'chmod', denied);
  t.mock.method(fs, 'cp', denied);
  await copyContent(resolve(temporary, 'source'), resolve(temporary, 'output'));
  assert.deepEqual(await readFile(target), await readFile(source));
  assert.deepEqual(
    await readFile(resolve(temporary, 'output/nested/font.bin')),
    Buffer.from([0, 128, 255, 13, 10]),
  );
  assert.equal((await stat(source)).mode, sourceMode);
  // A generated copy must remain editable even when the original file is read-only.
  await writeFile(target, 'updated');
  assert.equal(await readFile(target, 'utf8'), 'updated');
});

test('content copy refuses symbolic links and propagates real filesystem failures', async (t) => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'elvorance-content-failure-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = resolve(temporary, 'source');
  const target = resolve(temporary, 'target');
  await mkdir(source);
  await writeFile(resolve(source, 'config.js'), 'original');
  // A file cannot be treated as a destination directory; this must never produce success.
  await writeFile(target, 'existing target');
  await assert.rejects(copyContent(source, target), { code: 'EEXIST' });
  await assert.rejects(copyContent(resolve(temporary, 'missing'), resolve(temporary, 'output')), {
    code: 'ENOENT',
  });
  // Directory junctions do not require Windows Developer Mode/elevated symlink privileges.
  const link = resolve(temporary, 'link');
  await symlink(source, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(copyContent(link, resolve(temporary, 'output')), /refuses a symbolic link/);
  await assert.rejects(copyContent(source, link), /symbolic-link destination/);
  assert.equal(await readFile(resolve(source, 'config.js'), 'utf8'), 'original');
});
