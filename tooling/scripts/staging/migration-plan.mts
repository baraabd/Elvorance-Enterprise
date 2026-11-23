import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { domains, sourceRevision } from '../../../infra/railway/staging/target.mts';
import {
  migrationChecksum,
  migrationManifest,
} from '../../../packages/service-kit/src/migration-ledger.ts';
import type { Migration } from '../../../packages/service-kit/src/migrations.ts';
const services = [];
for (const service of domains) {
  const compiled = resolve(`dist/staging-compiler/${service}.mjs`);
  await build({
    entryPoints: [`services/${service}/src/infrastructure/migrations/001_initial.ts`],
    outfile: compiled,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: ['pg-native'],
    banner: {
      js: 'import {createRequire} from "node:module"; const require=createRequire(import.meta.url);',
    },
  });
  const { migrations } = (await import(pathToFileURL(compiled).href)) as {
    migrations: Migration[];
  };
  services.push({
    service,
    manifestSha256: migrationManifest(migrations),
    migrations: migrations.map((m) => ({
      version: m.version,
      name: m.name,
      checksum: migrationChecksum(m),
    })),
  });
}
await mkdir('dist/staging', { recursive: true });
await writeFile(
  'dist/staging/migrations.json',
  JSON.stringify(
    { source: sourceRevision(), mode: 'plan-only-no-database-connection', services },
    null,
    2,
  ),
);
