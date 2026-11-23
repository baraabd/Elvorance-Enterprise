import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { ensure } from '../../../infra/railway/staging/target.mts';
const repository = 'baraabd/Elvorance-Enterprise';
const expected = [
  'Verify Elvorance Enterprise',
  'Backend distributed runtime',
  'Rep native verification',
  'Isolated acceptance verification',
  'Hosted staging tooling',
  'Sprint 02 staging gate',
];
const approved = process.env.APPROVED_SOURCE_SHA ?? '';
ensure(/^[a-f0-9]{40}$/.test(approved), 'Exact approved source SHA required.');
ensure(
  process.env.GITHUB_REPOSITORY === repository && process.env.GITHUB_REF === 'refs/heads/main',
  'Release gate runs only from the trusted main workflow.',
);
ensure(
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === approved,
  'Checkout does not match approval.',
);
execFileSync('git', ['merge-base', '--is-ancestor', approved, 'origin/main'], { stdio: 'pipe' });
type Protection = {
  enforce_admins?: { enabled: boolean };
  required_pull_request_reviews?: { required_approving_review_count: number };
  required_status_checks?: { strict: boolean; contexts?: string[]; checks?: { context: string }[] };
};
type Environment = {
  protection_rules?: { type: string; reviewers?: unknown[]; prevent_self_review?: boolean }[];
  deployment_branch_policy?: { protected_branches: boolean };
};
type Run = {
  id: number;
  name: string;
  head_sha: string;
  created_at: string;
  status: string;
  conclusion: string | null;
  html_url: string;
};
async function get<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    headers: {
      authorization: `Bearer ${process.env.GH_TOKEN ?? ''}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  ensure(response.ok, 'Required GitHub release evidence is unavailable.');
  return response.json();
}
const protection = await get<Protection>('branches/main/protection');
ensure(
  protection.enforce_admins?.enabled === true &&
    (protection.required_pull_request_reviews?.required_approving_review_count ?? 0) >= 1 &&
    protection.required_status_checks?.strict === true,
  'main protection is not enforced.',
);
const contexts = [
  ...(protection.required_status_checks?.contexts ?? []),
  ...(protection.required_status_checks?.checks ?? []).map(
    (check: { context: string }) => check.context,
  ),
];
ensure(
  contexts.includes('FULL-CI / required') && contexts.includes('Sprint 02 / required'),
  'Required CI contexts are not protected.',
);
const environment = await get<Environment>('environments/staging');
ensure(
  environment.protection_rules?.some(
    (rule: { type: string; reviewers?: unknown[]; prevent_self_review?: boolean }) =>
      rule.type === 'required_reviewers' &&
      (rule.reviewers?.length ?? 0) > 0 &&
      rule.prevent_self_review === true,
  ),
  'Independent staging environment approval must be enforced.',
);
ensure(
  environment.deployment_branch_policy?.protected_branches === true,
  'Staging environment must accept protected branches only.',
);
const runs: Run[] = [];
for (let page = 1; page <= 10; page++) {
  const result = await get<{ workflow_runs: Run[] }>(
    `actions/runs?head_sha=${approved}&per_page=100&page=${page}`,
  );
  runs.push(...result.workflow_runs);
  if (result.workflow_runs.length < 100) break;
}
const evidence = expected.map((name) => {
  const matches = runs
    .filter((run) => run.name === name && run.head_sha === approved)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const run = matches[0];
  ensure(
    run && run.status === 'completed' && run.conclusion === 'success',
    `Mandatory exact-source workflow missing or unsuccessful: ${name}`,
  );
  return { name, id: run.id, source: run.head_sha, conclusion: run.conclusion, url: run.html_url };
});
await mkdir('dist/staging', { recursive: true });
await writeFile(
  'dist/staging/release-gate.json',
  JSON.stringify(
    {
      approved,
      passed: true,
      evidence,
      cloudMutation: false,
      next: 'Explicit owner-approved connector deployment; this workflow does not apply cloud changes.',
    },
    null,
    2,
  ),
);
