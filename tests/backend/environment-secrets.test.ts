import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, realpath, stat, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  createEnvironmentSecrets,
  validateEnvironmentSecrets,
  assertSecretFilePlatform,
} from '../../infra/environments/secrets.mts';
import { environmentSourceRoot } from '../../infra/environments/private-path.mts';

const posixFiles = {
  skip:
    process.platform === 'win32'
      ? 'Compose secret generation requires Linux/WSL with POSIX permissions.'
      : false,
};

test('Windows secret generation fails explicitly rather than weakening confidentiality', () => {
  assert.throws(() => assertSecretFilePlatform('win32'), /Linux\/WSL/);
  assert.doesNotThrow(() => assertSecretFilePlatform('linux'));
});

test(
  'isolated secret initialization is private and never overwrites or reuses an environment',
  posixFiles,
  async () => {
    const base = await realpath(await mkdtemp(resolve(tmpdir(), 'elvorance-secrets-test-')));
    const directory = resolve(base, 'staging');
    try {
      await createEnvironmentSecrets(directory, 'staging');
      const password = await readFile(resolve(directory, 'crm_db_password'), 'utf8');
      assert.match(password, /^[a-f0-9]{64}$/);
      assert.notEqual(password, await readFile(resolve(directory, 'sales_db_password'), 'utf8'));
      assert.match(
        await readFile(resolve(directory, 'crm_database_url'), 'utf8'),
        /@postgres:5432\/atlas_crm$/,
      );
      if (process.platform !== 'win32') {
        assert.equal((await stat(directory)).mode & 0o777, 0o700);
        assert.equal((await stat(resolve(directory, 'crm_db_password'))).mode & 0o777, 0o444);
        assert.equal((await stat(resolve(directory, 'environment.json'))).mode & 0o777, 0o600);
      }
      await validateEnvironmentSecrets(directory, 'staging');
      await assert.rejects(
        () => createEnvironmentSecrets(directory, 'production'),
        /across environments/,
      );
      await assert.rejects(
        () => createEnvironmentSecrets(directory, 'staging'),
        /already initialized/,
      );
      assert.equal(await readFile(resolve(directory, 'crm_db_password'), 'utf8'), password);
      await assert.rejects(
        () => createEnvironmentSecrets(resolve('infra/environments/..hidden-secrets'), 'staging'),
        /outside/,
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  },
);

test(
  'secret generation rejects symlink ancestors and deployment rejects unsafe mounts',
  posixFiles,
  async () => {
    const base = await realpath(await mkdtemp(resolve(tmpdir(), 'elvorance-secret-paths-')));
    const directory = resolve(base, 'staging');
    try {
      const alias = resolve(base, 'source-alias');
      await symlink(environmentSourceRoot, alias, 'dir');
      await assert.rejects(
        () => createEnvironmentSecrets(resolve(alias, 'leaked-secrets'), 'staging'),
        /symbolic links/,
      );
      await assert.rejects(() => stat(resolve(environmentSourceRoot, 'leaked-secrets')), {
        code: 'ENOENT',
      });
      await createEnvironmentSecrets(directory, 'staging');
      await chmod(directory, 0o755);
      await assert.rejects(() => validateEnvironmentSecrets(directory, 'staging'), /0700/);
      await chmod(directory, 0o700);
      await chmod(resolve(directory, 'crm_database_url'), 0o600);
      await assert.rejects(() => validateEnvironmentSecrets(directory, 'staging'), /0444/);
      await chmod(resolve(directory, 'crm_database_url'), 0o444);
      const external = resolve(base, 'unrelated-file');
      await writeFile(external, 'fixture only', { mode: 0o444 });
      await rm(resolve(directory, 'crm_database_url'));
      await symlink(external, resolve(directory, 'crm_database_url'));
      await assert.rejects(() => validateEnvironmentSecrets(directory, 'staging'), /regular file/);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  },
);

test(
  'concurrent secret initializers cannot combine staging and production credentials',
  posixFiles,
  async () => {
    const base = await realpath(await mkdtemp(resolve(tmpdir(), 'elvorance-secret-race-')));
    const directory = resolve(base, 'new-environment');
    try {
      const results = await Promise.allSettled([
        createEnvironmentSecrets(directory, 'staging'),
        createEnvironmentSecrets(directory, 'production'),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const metadata = JSON.parse(
        await readFile(resolve(directory, 'environment.json'), 'utf8'),
      ) as {
        environment: 'staging' | 'production';
      };
      await validateEnvironmentSecrets(directory, metadata.environment);
      assert.equal(
        new URL(await readFile(resolve(directory, 'rabbitmq_url'), 'utf8')).pathname,
        `/elvorance-${metadata.environment}`,
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  },
);
