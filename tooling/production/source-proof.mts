import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { hash, identity } from './evidence.mts';

export interface TreeBlob {
  path: string;
  mode: string;
  sha: string;
}
export const gitBlob = (bytes: Uint8Array): string =>
  createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
/** Reconcile PR #7's tracked-source package proof with the canonical S01 evidence schema. */
export function verifyTrackedArchive(
  tree: TreeBlob[],
  contents: Record<string, Uint8Array>,
  canonical: (path: string, bytes: Uint8Array) => string,
) {
  const failures: string[] = [];
  const seen = new Set<string>();
  if (!tree.length) failures.push('Empty source tree');
  const entries = tree.map((entry) => {
    if (seen.has(entry.path)) failures.push(`Duplicate source entry: ${entry.path}`);
    seen.add(entry.path);
    const valid =
      ['100644', '100755'].includes(entry.mode) &&
      /^[a-f0-9]{40}$/.test(entry.sha) &&
      entry.path.length > 0 &&
      !entry.path.startsWith('/') &&
      !entry.path.includes('\\') &&
      !entry.path.split('/').some((part) => part === '..' || part === '.' || part === '');
    if (!valid) failures.push(`Unsupported source entry: ${entry.path}`);
    const bytes = valid ? contents[`Elvorance-Enterprise/${entry.path}`] : undefined;
    const blob = bytes === undefined ? null : gitBlob(bytes);
    const canonicalBlob = bytes === undefined ? null : canonical(entry.path, bytes);
    // Existing parity intentionally rewrites exactly this report. It must still be present.
    const generated = entry.path === 'tests/design-parity/artifacts/latest-results.json';
    const disposition =
      !valid || bytes === undefined
        ? 'BLOCKED'
        : blob === entry.sha
          ? 'exact-source-bytes'
          : canonicalBlob === entry.sha
            ? 'attribute-normalized-source-bytes'
            : generated
              ? 'declared-generated-report'
              : 'BLOCKED';
    if (disposition === 'BLOCKED') failures.push(`Source archive drift/missing: ${entry.path}`);
    return {
      path: entry.path,
      sourceBlob: entry.sha,
      packagedBlob: blob,
      canonicalBlob,
      sha256: bytes === undefined ? null : hash(bytes),
      disposition,
    };
  });
  return { status: failures.length ? 'BLOCKED' : 'PASS', failures, entries };
}
export async function main(): Promise<void> {
  const version: unknown = JSON.parse(await readFile('package.json', 'utf8')).version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version))
    throw new Error('Invalid package version');
  const path = `dist/Elvorance-Enterprise-${version}.zip`;
  const archive = await readFile(path);
  const source = await identity();
  const rows = execFileSync('git', ['ls-tree', '-r', '-z', 'HEAD'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  const tree: TreeBlob[] = rows.map((row) => {
    const match = /^(\d+) blob ([a-f0-9]{40})\t(.+)$/.exec(row);
    if (!match?.[1] || !match[2] || !match[3]) throw new Error('Unsupported source tree entry');
    return { mode: match[1], sha: match[2], path: match[3] };
  });
  const report = verifyTrackedArchive(tree, unzipSync(archive), (path, bytes) =>
    execFileSync('git', ['hash-object', `--path=${path}`, '--stdin'], {
      input: bytes,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    }).trim(),
  );
  await writeFile(
    'dist/source-proof.json',
    JSON.stringify(
      {
        schemaVersion: 1,
        ...source,
        archive: { path, sha256: hash(archive), bytes: archive.length },
        ...report,
        scope:
          'Tracked source blobs and Git-attribute normalization; parity is a declared generated output. Extra preview/report files and ZIP executable metadata are not certified as Git source.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({ status: report.status, files: tree.length, failures: report.failures }),
  );
  if (report.status !== 'PASS') process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
