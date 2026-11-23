import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repReleaseConfig, type RepReleaseConfig } from './release-config.mts';

export const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
export const repOutput = resolve(repositoryRoot, 'apps/rep-mobile/dist');
export const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');
export interface RepBuildManifest {
  schemaVersion: 1;
  dataMode: 'server';
  environment: RepReleaseConfig['environment'];
  apiBaseUrl: string;
  auth: RepReleaseConfig['auth'];
  sourceRevision: string;
  sourceHash: string;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  createdAt: string;
}
export function inputHash(inputs: Record<string, string>): string {
  return sha256(
    JSON.stringify(
      Object.fromEntries(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b))),
    ),
  );
}
function within(base: string, name: string): string {
  const file = resolve(base, name);
  const path = relative(base, file);
  if (!path || path.startsWith('..') || isAbsolute(path))
    throw new Error('Invalid build manifest path.');
  return file;
}
export async function assertRepBuild(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RepBuildManifest> {
  const config = repReleaseConfig(env);
  const manifest = JSON.parse(
    await readFile(resolve(repOutput, 'rep-build.json'), 'utf8'),
  ) as RepBuildManifest;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.dataMode !== 'server' ||
    manifest.environment !== config.environment ||
    manifest.apiBaseUrl !== config.apiBaseUrl ||
    JSON.stringify(manifest.auth) !== JSON.stringify(config.auth) ||
    !/^[a-f0-9]{40}$/.test(manifest.sourceRevision) ||
    !manifest.inputs ||
    !manifest.outputs ||
    inputHash(manifest.inputs) !== manifest.sourceHash
  )
    throw new Error(
      'Build provenance does not match the selected server environment. Rebuild the representative application.',
    );
  for (const required of ['index.html', 'config.js', 'assets/app.js', 'assets/app.css']) {
    if (!manifest.outputs[required]) throw new Error(`Build manifest is missing ${required}.`);
  }
  if (!Object.keys(manifest.inputs).includes('apps/rep-mobile/src/server-main.ts')) {
    throw new Error('A release must use the isolated server entrypoint.');
  }
  for (const [base, files] of [
    [repositoryRoot, manifest.inputs],
    [repOutput, manifest.outputs],
  ] as const) {
    for (const [name, expected] of Object.entries(files)) {
      if (
        !/^[a-f0-9]{64}$/.test(expected) ||
        sha256(await readFile(within(base, name))) !== expected
      ) {
        throw new Error(
          `Stale or modified release input/output: ${name}. Rebuild before native synchronization.`,
        );
      }
    }
  }
  return manifest;
}
