import { pathToFileURL } from 'node:url';
import { adminTokenFromEnv, createAdminClient } from './admin-client.mts';
import { createIdentityDefinition, identityInputFromEnv } from './realm.mts';
import { bootstrapIdentity } from './provision.mts';

async function main() {
  const input = identityInputFromEnv();
  const definition = createIdentityDefinition(input);
  const token = await adminTokenFromEnv();
  const result = await bootstrapIdentity(createAdminClient(input.baseUrl, token), definition);
  console.log(JSON.stringify({ ...result, ...definition.publicConfig }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // Helpers emit redacted errors only, never upstream response bodies or token values.
    console.error(error instanceof Error ? error.message : 'Identity bootstrap failed.');
    process.exitCode = 1;
  });
}
