import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { domains } from './topology.mts';
import { privateSecretPath } from './private-path.mts';

export const environmentSecretNames = [
  'postgres_admin_password',
  'oidc_database_password',
  'oidc_admin_password',
  'rabbitmq_password',
  'rabbitmq_url',
  ...domains.flatMap((domain) => [`${domain}_db_password`, `${domain}_database_url`]),
];

export function assertSecretFilePlatform(platform: NodeJS.Platform = process.platform): void {
  if (platform === 'win32') {
    throw new Error(
      'Compose secret initialization requires Linux/WSL or another POSIX filesystem; Windows cannot enforce the required 0700/0444 file permissions.',
    );
  }
}

/** Fail before generating a deployment if secret files are unsafe or unreadable by its containers. */
export async function validateEnvironmentSecrets(
  directory: string,
  environment: 'staging' | 'production',
): Promise<void> {
  assertSecretFilePlatform();
  const target = privateSecretPath(directory);
  const details = await lstat(target);
  if (!details.isDirectory() || (details.mode & 0o777) !== 0o700) {
    throw new Error('Secret directory must have owner-only permissions (0700).');
  }
  const metadataPath = resolve(target, 'environment.json');
  const metadataDetails = await lstat(metadataPath);
  if (
    !metadataDetails.isFile() ||
    metadataDetails.nlink !== 1 ||
    (metadataDetails.mode & 0o777) !== 0o600
  ) {
    throw new Error('Secret metadata must be a private regular file (0600).');
  }
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
    schemaVersion?: number;
    environment?: string;
  };
  if (metadata.schemaVersion !== 1 || metadata.environment !== environment) {
    throw new Error('Secret files belong to a different environment or have invalid metadata.');
  }
  for (const name of environmentSecretNames) {
    const file = await lstat(resolve(target, name));
    if (!file.isFile() || file.nlink !== 1 || (file.mode & 0o777) !== 0o444 || file.size === 0) {
      throw new Error(
        `Secret ${name} must be a nonempty, unlinked regular file (0444) inside the private directory.`,
      );
    }
  }
}

/** Generates a new private secret directory. Never overwrites or prints credential material. */
export async function createEnvironmentSecrets(
  directory: string,
  environment: 'staging' | 'production',
): Promise<void> {
  assertSecretFilePlatform();
  const target = privateSecretPath(directory);
  if (!['staging', 'production'].includes(environment))
    throw new Error('Select staging or production explicitly.');
  const metadata = resolve(target, 'environment.json');
  try {
    const metadataDetails = await lstat(metadata);
    if (!metadataDetails.isFile() || metadataDetails.nlink !== 1)
      throw new Error('Secret metadata must be a private regular file.');
    const previous = JSON.parse(await readFile(metadata, 'utf8')) as { environment?: string };
    if (previous.environment !== environment)
      throw new Error('Secret directories cannot be reused across environments.');
    throw new Error(
      'Secret directory already initialized. This command never rotates existing database credentials.',
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    await lstat(target);
    throw new Error('Choose a new, empty secret directory.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  privateSecretPath(target);
  // The final mkdir is exclusive: concurrent initializers cannot mix environments.
  await mkdir(target, { mode: 0o700 });
  await chmod(target, 0o700);
  const secrets: Record<string, string> = {
    postgres_admin_password: randomBytes(32).toString('hex'),
    oidc_database_password: randomBytes(32).toString('hex'),
    oidc_admin_password: randomBytes(32).toString('hex'),
    rabbitmq_password: randomBytes(32).toString('hex'),
  };
  secrets.rabbitmq_url = `amqp://elvorance:${secrets.rabbitmq_password}@rabbitmq:5672/elvorance-${environment}`;
  for (const domain of domains) {
    const password = randomBytes(32).toString('hex');
    secrets[`${domain}_db_password`] = password;
    secrets[`${domain}_database_url`] =
      `postgresql://atlas_${domain}:${password}@postgres:5432/atlas_${domain}`;
  }
  // Compose file-backed secrets are bind mounts; uid/gid/mode remapping is not
  // implemented. Different non-root container users need read permission. Host
  // confidentiality comes from the 0700 enclosing directory, not shared host UIDs.
  for (const [name, value] of Object.entries(secrets)) {
    const file = resolve(target, name);
    await writeFile(file, value, { flag: 'wx', mode: 0o444 });
    await chmod(file, 0o444);
  }
  await writeFile(
    metadata,
    JSON.stringify(
      {
        schemaVersion: 1,
        environment,
        createdAt: new Date().toISOString(),
        files: Object.keys(secrets),
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  await chmod(metadata, 0o600);
  await validateEnvironmentSecrets(target, environment);
}
