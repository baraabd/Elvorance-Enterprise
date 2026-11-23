import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { composeEnvironment } from './compose.mts';
import {
  validateAcceptance,
  verifyEvidence,
} from '../../tooling/scripts/rep-release/acceptance.mts';
import { validateEnvironment, type EnvironmentSpec } from './topology.mts';
import { validateEnvironmentSecrets } from './secrets.mts';
const [specFile, output, acceptanceFile] = process.argv.slice(2);
if (!specFile || !output)
  throw new Error(
    'Usage: render.mts <environment-spec.json> <compose-output.json> [staging-acceptance.json]',
  );
const spec = JSON.parse(await readFile(resolve(specFile), 'utf8')) as EnvironmentSpec;
validateEnvironment(spec);
await validateEnvironmentSecrets(spec.secretsDirectory, spec.environment);
if (spec.environment === 'production') {
  if (!acceptanceFile)
    throw new Error('Production rendering requires verified Staging acceptance.');
  const accepted = validateAcceptance(
    JSON.parse(await readFile(resolve(acceptanceFile), 'utf8')),
    spec.sourceRevision,
  );
  await verifyEvidence(accepted, dirname(resolve(acceptanceFile)));
  const stagingHosts = new Set([
    new URL(accepted.staging.gateway).hostname,
    new URL(accepted.staging.issuer).hostname,
  ]);
  if (
    stagingHosts.has(new URL(spec.gatewayOrigin).hostname) ||
    stagingHosts.has(new URL(spec.issuer).hostname)
  )
    throw new Error('Production must use separate endpoints and identity infrastructure.');
  for (const [name, image] of Object.entries(accepted.serviceImages))
    if (spec.images[name as keyof EnvironmentSpec['images']] !== image)
      throw new Error(`Production image differs from accepted Staging image: ${name}`);
}
const compose = composeEnvironment(spec);
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(resolve(output), JSON.stringify(compose, null, 2) + '\n', {
  flag: 'wx',
  mode: 0o600,
});
console.log(
  `Rendered ${spec.environment} deployment for ${spec.sourceRevision}. No deployment was performed.`,
);
