import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const textHash = (bytes) => hash(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n')));

function localPath(base, path) {
  if (
    typeof path !== 'string' ||
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '.' || part === '..') ||
    isAbsolute(path)
  )
    throw new Error(`Invalid patch path: ${path}`);
  const file = resolve(base, path);
  const rel = relative(base, file);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) {
    throw new Error(`Patch path escapes its root: ${path}`);
  }
  return file;
}

async function rejectLinks(base, path) {
  let current = base;
  for (const part of path.split('/')) {
    current = resolve(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`Patch refuses a symbolic link: ${current}`);
  }
}

async function readOptional(file) {
  try {
    return await readFile(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function matches(bytes, expected) {
  return (
    bytes !== null &&
    expected &&
    (hash(bytes) === expected.sha256 || textHash(bytes) === expected.textSha256)
  );
}

/** Apply only known source files; all local conflicts are found before the first write. */
export async function applyHotfix({ project, patch, check = false }) {
  const projectRoot = await realpath(resolve(project));
  const patchRoot = await realpath(resolve(patch));
  const manifest = JSON.parse(await readFile(resolve(patchRoot, 'manifest.json'), 'utf8'));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.release !== '2.0.1' ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error('Unsupported hotfix manifest.');
  }
  await rejectLinks(projectRoot, 'package.json');
  const pkg = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
  if (pkg.name !== 'atlas-crm-enterprise' || !['2.0.0', '2.0.1'].includes(pkg.version)) {
    throw new Error('Select the AtlasCRM Enterprise 2.0.0/2.0.1 project root.');
  }
  const plans = [];
  const conflicts = [];
  const seen = new Set();
  for (const entry of manifest.files) {
    const path = entry.path;
    if (seen.has(path)) throw new Error(`Duplicate patch path: ${path}`);
    seen.add(path);
    // This maintenance release never writes environment files, native projects or user data.
    if (
      !/^(?:tooling\/|tests\/|docs\/|\.github\/workflows\/|infra\/compose\/compose\.yaml$|(?:package(?:-lock)?\.json|README\.md|\.prettierignore|\.gitignore|\.gitattributes)$)/.test(
        path,
      ) ||
      path
        .split('/')
        .some((part) => ['.env', 'node_modules', '.git', '.atlas-backups'].includes(part))
    )
      throw new Error(`Path is outside this hotfix scope: ${path}`);
    const source = localPath(resolve(patchRoot, 'files'), path);
    const destination = localPath(projectRoot, path);
    await rejectLinks(patchRoot, `files/${path}`);
    await rejectLinks(projectRoot, path);
    const next = await readFile(source);
    if (hash(next) !== entry.after?.sha256) throw new Error(`Patch file checksum failed: ${path}`);
    const previous = await readOptional(destination);
    if (matches(previous, entry.after)) continue;
    if (entry.before === null ? previous !== null : !matches(previous, entry.before)) {
      conflicts.push(path);
    } else {
      plans.push({ path, destination, previous, next });
    }
  }
  if (conflicts.length) {
    throw new Error(
      `Local edits or an unexpected source version were found. No files changed. Review these files before merging the hotfix:\n${conflicts.join('\n')}`,
    );
  }
  if (check || !plans.length)
    return { checked: manifest.files.length, changed: 0, pending: plans.length, backup: null };

  const backupRelative = `.atlas-backups/hotfix-2.0.1-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`;
  await rejectLinks(projectRoot, backupRelative);
  const backup = resolve(projectRoot, backupRelative);
  await mkdir(backup, { recursive: true });
  for (const item of plans) {
    if (item.previous === null) continue;
    const file = localPath(resolve(backup, 'files'), item.path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, item.previous);
  }
  await writeFile(
    resolve(backup, 'manifest.json'),
    JSON.stringify(
      {
        release: manifest.release,
        files: plans.map((item) => ({ path: item.path, existed: item.previous !== null })),
      },
      null,
      2,
    ) + '\n',
  );

  const attempted = [];
  try {
    for (const item of plans) {
      await rejectLinks(projectRoot, item.path);
      await mkdir(dirname(item.destination), { recursive: true });
      attempted.push(item);
      await writeFile(item.destination, item.next);
    }
  } catch (cause) {
    const restoreErrors = [];
    for (const item of attempted.reverse()) {
      try {
        if (item.previous === null) await rm(item.destination, { force: true });
        else await writeFile(item.destination, item.previous);
      } catch {
        restoreErrors.push(item.path);
      }
    }
    throw new Error(
      `Hotfix write failed. Backup: ${backup}. ${restoreErrors.length ? `Restore these files from backup: ${restoreErrors.join(', ')}` : 'Attempted changes were restored.'}`,
      { cause },
    );
  }
  return { checked: manifest.files.length, changed: plans.length, pending: 0, backup };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const projectAt = args.indexOf('--project');
    if (
      projectAt < 0 ||
      !args[projectAt + 1] ||
      args.some((arg, index) => index !== projectAt + 1 && !['--project', '--check'].includes(arg))
    ) {
      throw new Error(
        'Usage: node apply.mjs --project C:\\Mobile_Apps\\AtlasCRM-Enterprise [--check]',
      );
    }
    const result = await applyHotfix({
      project: args[projectAt + 1],
      patch: dirname(fileURLToPath(import.meta.url)),
      check: args.includes('--check'),
    });
    console.log(JSON.stringify(result, null, 2));
    console.log(
      result.pending
        ? 'Preflight passed. Run without --check to apply.'
        : 'Hotfix ready. Next: npm.cmd ci, then npm.cmd run verify.',
    );
  } catch (error) {
    console.error(error.message);
    if (error.cause) console.error(error.cause.message);
    process.exitCode = 1;
  }
}
