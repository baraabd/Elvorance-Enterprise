import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  minimumProtection,
  object,
  protectionPlan,
  protectionProblems,
} from './branch-protection.mts';
import { sha256 } from './source.mts';

const repository = 'baraabd/Elvorance-Enterprise';
const branch = 'main';
/** Uses the operator's standard gh login. No credentials are accepted as CLI arguments. */
function api(path: string, body?: unknown): unknown {
  if (!path.startsWith(`repos/${repository}/`) && path !== `repos/${repository}`)
    throw new Error('Repository scope violation');
  const args = [
    'api',
    '--hostname',
    'github.com',
    '--method',
    body === undefined ? 'GET' : 'PUT',
    '-H',
    'Accept: application/vnd.github+json',
    '-H',
    'X-GitHub-Api-Version: 2026-03-10',
    path,
  ];
  if (body !== undefined) args.push('--input', '-');
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    ...(body === undefined ? {} : { input: JSON.stringify(body) }),
  });
  if (result.error)
    throw new Error('GitHub CLI unavailable; a standard authenticated gh installation is required');
  if (result.status !== 0)
    throw new Error(
      'GitHub API request failed; verify repository access and Administration:write for apply (no credentials are logged)',
    );
  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error('GitHub returned invalid JSON');
  }
}
export async function main(args: string[]): Promise<void> {
  const apply = args.includes('--apply');
  const expectedArg = args.find((arg) => arg.startsWith('--expected-main='));
  const expected = expectedArg?.slice('--expected-main='.length);
  if (args.some((arg) => arg !== '--apply' && !arg.startsWith('--expected-main=')))
    throw new Error(
      'Unknown argument. Supported: --apply --expected-main=<reviewed 40-character SHA>',
    );
  if (apply && (!expected || !/^[a-f0-9]{40}$/.test(expected)))
    throw new Error('Applying protection requires --expected-main=<freshly inspected SHA>');
  const observedAt = new Date().toISOString();
  const readBranch = () => object(api(`repos/${repository}/branches/${branch}`));
  const before = readBranch();
  const beforeSha = object(before?.commit)?.sha;
  if (
    typeof beforeSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(beforeSha) ||
    typeof before?.protected !== 'boolean'
  )
    throw new Error('Malformed live branch identity');
  if (expected && beforeSha !== expected)
    throw new Error('Main moved; inspect its new head before changing governance');
  const existing = before.protected
    ? api(`repos/${repository}/branches/${branch}/protection`)
    : null;
  const plan = protectionPlan(existing);
  let applied = false;
  if (apply && plan.action === 'BLOCKED') throw new Error(plan.errors.join('; '));
  if (apply && plan.action === 'ENABLE') {
    const permissions = object(object(api(`repos/${repository}`))?.permissions);
    if (permissions?.admin !== true)
      throw new Error('The authenticated account lacks repository-administrator permission');
    const fresh = readBranch();
    if (object(fresh?.commit)?.sha !== beforeSha || fresh?.protected !== false)
      throw new Error('Branch or protection changed concurrently; no update performed');
    api(`repos/${repository}/branches/${branch}/protection`, minimumProtection());
    applied = true;
  }
  const after = readBranch();
  const protection = after?.protected
    ? api(`repos/${repository}/branches/${branch}/protection`)
    : null;
  const errors = protectionProblems(protection);
  if (object(after?.commit)?.sha !== beforeSha)
    errors.push('Main changed during governance verification; re-inspection required');
  const report = {
    schemaVersion: 1,
    repository,
    branch,
    observedAt,
    finishedAt: new Date().toISOString(),
    beforeSha,
    afterSha: object(after?.commit)?.sha ?? null,
    applied,
    status: errors.length ? 'BLOCKED' : 'PASS',
    errors,
    scope:
      'Live branch-protection settings only; not review approval, semantic acceptance or final-source FULL-CI',
    protection,
    protectionSha256: sha256(JSON.stringify(protection)),
  };
  await mkdir('dist/production', { recursive: true });
  await writeFile(
    'dist/production/repository-protection.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({ status: report.status, repository, branch, applied, errors }, null, 2),
  );
  if (errors.length) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(
      JSON.stringify({
        status: 'BLOCKED',
        error: error instanceof Error ? error.message : 'Governance verification failed',
      }),
    );
    process.exitCode = 1;
  }
}
