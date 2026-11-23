import { readFile } from 'node:fs/promises';
import { ensure } from '../../../infra/railway/staging/target.mts';
import { validateVercelTarget, emitVercelOutput, type VercelTarget } from './vercel-output.mts';
const role = process.argv[2];
const plan = JSON.parse(await readFile('infra/vercel/staging-projects.json', 'utf8')) as {
  teamId: string;
  target: string;
  projects: VercelTarget[];
};
ensure(plan.target === 'preview', 'Production deployment is not supported by this build.');
const target = plan.projects.find((project) => project.role === role);
ensure(target, 'Choose admin, client or rep.');
const origin = validateVercelTarget(target, plan.teamId, process.env);
await import('./build-web.mts');
await emitVercelOutput(
  target.role,
  origin,
  `dist/hosted-web/${target.role}`,
  `dist/vercel/${target.role}`,
);
