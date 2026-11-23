import { Pool } from 'pg';
import { createAdminClient, type AdminClient } from '../../identity/admin-client.mts';
import { createIdentityDefinition } from '../../identity/realm.mts';
import { bootstrapIdentity } from '../../identity/provision.mts';
import {
  assertStaging,
  domains,
  ensure,
  identifier,
  ownedName,
  privateDatabaseUrl,
  stagingTarget,
} from './target.mts';

export async function identityAdmin(): Promise<AdminClient> {
  assertStaging();
  const username = process.env.KEYCLOAK_BOOTSTRAP_USERNAME;
  const password = process.env.KEYCLOAK_BOOTSTRAP_PASSWORD;
  ensure(username && password, 'Identity bootstrap credentials are missing.');
  const response = await fetch(
    `${stagingTarget.identityOrigin}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username,
        password,
      }),
    },
  );
  ensure(
    response.status === 200,
    `Identity administration authentication failed (HTTP ${response.status}).`,
  );
  const body = (await response.json()) as { access_token?: unknown };
  ensure(typeof body.access_token === 'string', 'Invalid identity administration response.');
  return createAdminClient(stagingTarget.identityOrigin, body.access_token);
}
export function identityDefinition() {
  return createIdentityDefinition({
    environment: 'staging',
    baseUrl: stagingTarget.identityOrigin,
    webOrigin: stagingTarget.web.rep,
    webRedirectUri: `${stagingTarget.web.rep}/callback`,
    adminWebOrigin: stagingTarget.web.admin,
    adminWebRedirectUri: `${stagingTarget.web.admin}/callback`,
    clientWebOrigin: stagingTarget.web.client,
    clientWebRedirectUri: `${stagingTarget.web.client}/callback`,
  });
}

/** Creates only explicitly owned staging resources; never changes existing passwords or drops data. */
export async function bootstrapStaging() {
  assertStaging();
  const url = privateDatabaseUrl(process.env.PGADMIN_URL ?? '');
  const pool = new Pool({ connectionString: url.href, max: 1, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  const results: Array<{
    service: string;
    database: string;
    createdRole: boolean;
    createdDatabase: boolean;
  }> = [];
  try {
    await client.query('SELECT pg_advisory_lock(74821023)');
    const known = new Set(['postgres', 'railway', ...domains.map(ownedName)]);
    const databases = (
      await client.query<{ datname: string }>(
        'SELECT datname FROM pg_database WHERE NOT datistemplate',
      )
    ).rows;
    ensure(
      databases.every((row) => known.has(row.datname)),
      'Unexpected database: refusing shared-cluster mutation.',
    );
    for (const service of domains) {
      const name = ownedName(service);
      const password = process.env[`${service.toUpperCase()}_DB_PASSWORD`] ?? '';
      ensure(
        /^[a-f0-9]{64}$/.test(password),
        `Missing protected database credential for ${service}.`,
      );
      const exists =
        (await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name])).rowCount !== 0;
      if (!exists)
        await client.query(
          `CREATE ROLE ${identifier(name)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`,
        );
      const role = (
        await client.query(
          'SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1',
          [name],
        )
      ).rows[0];
      ensure(
        role && Object.values(role).every((value) => value === false),
        `Unsafe existing role for ${service}.`,
      );
      const database = (
        await client.query<{ owner: string }>(
          'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',
          [name],
        )
      ).rows[0];
      if (!database)
        await client.query(`CREATE DATABASE ${identifier(name)} OWNER ${identifier(name)}`);
      else ensure(database.owner === name, `Unexpected database owner for ${service}.`);
      await client.query(`REVOKE ALL ON DATABASE ${identifier(name)} FROM PUBLIC`);
      await client.query(
        `GRANT CONNECT,CREATE,TEMPORARY ON DATABASE ${identifier(name)} TO ${identifier(name)}`,
      );
      const owned = new URL(url);
      owned.username = name;
      owned.password = password;
      owned.pathname = '/' + name;
      const check = new Pool({
        connectionString: owned.href,
        max: 1,
        connectionTimeoutMillis: 10000,
      });
      try {
        await check.query('SELECT 1');
      } finally {
        await check.end();
      }
      results.push({ service, database: name, createdRole: !exists, createdDatabase: !database });
    }
    // Only the two baseline administrative databases in this dedicated staging cluster.
    for (const row of databases.filter((row) => ['postgres', 'railway'].includes(row.datname))) {
      await client.query(`REVOKE CONNECT ON DATABASE ${identifier(row.datname)} FROM PUBLIC`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(74821023)').catch(() => undefined);
    client.release();
    await pool.end();
  }
  const admin = await identityAdmin();
  const definition = identityDefinition();
  const identity = await bootstrapIdentity(admin, definition);
  const second = await bootstrapIdentity(admin, definition);
  ensure(!second.created, 'Identity bootstrap is not idempotent.');
  return {
    databases: results,
    identity,
    identityBootstrapIdempotent: true,
    publicConfig: definition.publicConfig,
  };
}
