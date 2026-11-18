import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { composeEnvironment } from './compose.mts';
import {
  validateAcceptance,
  verifyEvidence,
} from '../../tooling/scripts/rep-release/acceptance.mts';
import type { EnvironmentSpec } from './topology.mts';
const [specFile, output, acceptanceFile] = process.argv.slice(2);
if (!specFile || !output)
  throw new Error(
    'Usage: render.mts <environment-spec.json> <compose-output.json> [staging-acceptance.json]',
  );
const spec = JSON.parse(await readFile(resolve(specFile), 'utf8')) as EnvironmentSpec;
if (spec.environment === 'production') {
  if (!acceptanceFile)
    throw new Error('Production rendering requires verified Staging acceptance.');
  const accepted = validateAcceptance(
    JSON.parse(await readFile(resolve(acceptanceFile), 'utf8')),
    spec.sourceRevision,
  );
  await verifyEvidence(accepted, dirname(resolve(acceptanceFile)));
  if (
    new URL(accepted.staging.gateway).origin === new URL(spec.gatewayOrigin).origin ||
    new URL(accepted.staging.issuer).origin === new URL(spec.issuer).origin
  )
    throw new Error('Production must use separate endpoints and identity infrastructure.');
  for (const [name, image] of Object.entries(accepted.serviceImages))
    if (spec.images[name as keyof EnvironmentSpec['images']] !== image)
      throw new Error(`Production image differs from accepted Staging image: ${name}`);
}
const compose = composeEnvironment(spec);
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(resolve(output), JSON.stringify(compose, null, 2) + '\n', { mode: 0o600 });
console.log(
  `Rendered ${spec.environment} deployment for ${spec.sourceRevision}. No deployment was performed.`,
);
