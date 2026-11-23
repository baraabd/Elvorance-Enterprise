import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createIdentityDefinition, identityInputFromEnv } from './realm.mts';

async function main() {
  const input = identityInputFromEnv();
  const definition = createIdentityDefinition(input);
  const directory = resolve(
    process.env.ELVORANCE_IDENTITY_OUTPUT_DIR ?? `dist/identity/${input.environment}`,
  );
  await mkdir(directory, { recursive: true });
  const files = {
    [`${definition.realm.realm}-realm.json`]: definition.realm,
    'user-profile.json': definition.userProfile,
    'public-config.json': definition.publicConfig,
  };
  for (const [name, value] of Object.entries(files)) {
    await writeFile(resolve(directory, name), `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    });
  }
  console.log(
    `Generated identity policy in ${directory}; realm remains disabled until bootstrap verification succeeds.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Identity generation failed.');
    process.exitCode = 1;
  });
}
