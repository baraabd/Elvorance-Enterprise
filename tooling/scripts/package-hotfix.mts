// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { zipSync } from 'fflate';
import { root } from './workspace.mts';

// Source provenance for the original 2.0.0 delivery; generated outputs are excluded by Git.
const baseline = 'c1b04b859435f99953a0ba1130c3946e1bae5a2c';
const repoRoot = resolve(root, '..');
const prefix = 'Elvorance-Enterprise-2.0.1-Hotfix';
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: null });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  return result.stdout;
};
const paths = [
  ...new Set([
    ...git('diff', '--name-only', baseline, '--', 'enterprise/').toString().trim().split('\n'),
    ...git('ls-files', '--others', '--exclude-standard', '--', 'enterprise/')
      .toString()
      .trim()
      .split('\n'),
  ]),
]
  .filter((path) => path && !path.startsWith('enterprise/tests/design-parity/artifacts/'))
  .sort();
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fingerprint = (bytes) => ({
  sha256: hash(bytes),
  textSha256: hash(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'))),
});
const archive = {};
const files = [];
for (const path of paths) {
  const relativePath = path.slice('enterprise/'.length);
  const after = await readFile(resolve(repoRoot, path));
  const previous = spawnSync('git', ['show', `${baseline}:${path}`], {
    cwd: repoRoot,
    encoding: null,
  });
  files.push({
    path: relativePath,
    before: previous.status === 0 ? fingerprint(previous.stdout) : null,
    after: fingerprint(after),
  });
  archive[`${prefix}/files/${relativePath}`] = new Uint8Array(after);
}
archive[`${prefix}/apply.mjs`] = new Uint8Array(
  await readFile(resolve(root, 'tooling/patches/apply-hotfix.mts')),
);
archive[`${prefix}/manifest.json`] = new TextEncoder().encode(
  JSON.stringify({ schemaVersion: 1, release: '2.0.1', baseline, files }, null, 2) + '\n',
);
archive[`${prefix}/README.txt`] = new TextEncoder().encode(
  'Elvorance Enterprise 2.0.1 hotfix\n\nFrom PowerShell, after extracting this archive:\n' +
    'node .\\apply.mjs --project C:\\Mobile_Apps\\Elvorance-Enterprise --check\n' +
    'node .\\apply.mjs --project C:\\Mobile_Apps\\Elvorance-Enterprise\n\n' +
    'The installer checks all original hashes before changing any file, accepts CRLF text, backs up changed files, and refuses local edits or symbolic links. It never touches .env, native projects or database volumes.\n' +
    'Then run npm.cmd ci and npm.cmd run verify in the project. Full instructions: docs/WINDOWS-TROUBLESHOOTING-2.0.1.md\n',
);
await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, `dist/${prefix}.zip`), zipSync(archive, { level: 6 }));
console.log(`Packaged ${files.length} source changes in ${prefix}.zip.`);
