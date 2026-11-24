/** Isolated test-only HTTP stack. Runtime application imports never reference this file. */
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const { build } = createRequire(import.meta.url)('esbuild') as typeof import('esbuild');
import { SignJWT } from 'jose';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import {
  authFromEnv,
  HttpCustomerDirectory,
  MemoryRepository,
  PgRepository,
  type Repository,
  type Migration,
} from '@elvorance/service-kit';
import { createApp as identity } from '../../services/identity/src/app.ts';
import { createApp as crm } from '../../services/crm/src/app.ts';
import { createApp as sales } from '../../services/sales/src/app.ts';
import { createApp as delivery } from '../../services/delivery/src/app.ts';
import { createApp as billing } from '../../services/billing/src/app.ts';
import { createApp as communications } from '../../services/communications/src/app.ts';
import { createApp as tracking } from '../../services/tracking/src/app.ts';
import { createApp as gateway } from '../../services/api-gateway/src/app.ts';
import * as identityStorage from '../../services/identity/src/infrastructure/migrations/001_initial.ts';
import * as crmStorage from '../../services/crm/src/infrastructure/migrations/001_initial.ts';
import * as salesStorage from '../../services/sales/src/infrastructure/migrations/001_initial.ts';
import * as deliveryStorage from '../../services/delivery/src/infrastructure/migrations/001_initial.ts';
import * as billingStorage from '../../services/billing/src/infrastructure/migrations/001_initial.ts';
import * as communicationsStorage from '../../services/communications/src/infrastructure/migrations/001_initial.ts';
import * as trackingStorage from '../../services/tracking/src/infrastructure/migrations/001_initial.ts';

import { consumeEvent, type EventHandler } from '@elvorance/events';
import * as crmEvents from '../../services/crm/src/application/events.ts';
import * as salesEvents from '../../services/sales/src/application/events.ts';
import * as deliveryEvents from '../../services/delivery/src/application/events.ts';
import * as billingEvents from '../../services/billing/src/application/events.ts';
import * as communicationsEvents from '../../services/communications/src/application/events.ts';
const root = process.cwd();
const storage = {
  identity: identityStorage,
  crm: crmStorage,
  sales: salesStorage,
  delivery: deliveryStorage,
  billing: billingStorage,
  communications: communicationsStorage,
  tracking: trackingStorage,
} satisfies Record<string, { tables: readonly string[]; migrations: Migration[] }>;
type Service = keyof typeof storage;
export async function fixture(mode: 'memory' | 'postgres' = 'memory') {
  const apps: FastifyInstance[] = [];
  const repositories = new Map<Service, Repository>();
  const connectionStrings = new Map<Service, string>();
  const provisioned: { role: string; databaseCreated: boolean }[] = [];
  let administrator: pg.Client | null = null;
  const secret = randomBytes(32).toString('hex');
  const auth = authFromEnv({
    NODE_ENV: 'test',
    AUTH_MODE: 'dev-hs256',
    OIDC_ISSUER: 'https://s05-isolated.invalid/',
    OIDC_AUDIENCE: 's05-isolated',
    DEV_JWT_SECRET: secret,
  });
  async function token(role: string, tenant = 'tenant-s05', clientId?: string) {
    return new SignJWT({
      tenant_id: tenant,
      roles: [role],
      ...(role === 'rep' ? { rep_id: 'rep-s05' } : {}),
      ...(clientId ? { client_id: clientId } : {}),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(`s05-${role}`)
      .setIssuer('https://s05-isolated.invalid/')
      .setAudience('s05-isolated')
      .setIssuedAt()
      .setExpirationTime('20m')
      .sign(new TextEncoder().encode(secret));
  }
  const admin = await token('admin');
  const rep = await token('rep');
  const outsider = await token('admin', 'tenant-other');
  async function close() {
    await Promise.all(apps.map((app) => app.close()));
    for (const repository of repositories.values())
      if (repository instanceof PgRepository) await repository.close();
    if (administrator) {
      for (const item of provisioned) {
        if (item.databaseCreated)
          await administrator.query(`DROP DATABASE IF EXISTS ${item.role} WITH (FORCE)`);
        await administrator.query(`DROP ROLE IF EXISTS ${item.role}`);
      }
      await administrator.end();
    }
  }
  try {
    if (mode === 'postgres') {
      const raw = process.env.ELVORANCE_TEST_POSTGRES_URL;
      if (!raw)
        throw new Error(
          'PostgreSQL E2E requires an explicitly supplied isolated test administrator URL. No fallback.',
        );
      const url = new URL(raw);
      if (
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.pathname !== '/postgres'
      )
        throw new Error(
          'Test provisioning accepts only a loopback PostgreSQL administrator database.',
        );
      administrator = new pg.Client({ connectionString: raw, connectionTimeoutMillis: 5000 });
      await administrator.connect();
      const prefix = `s05_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
      for (const [name, config] of Object.entries(storage)) {
        const role = `${prefix}_${name}`;
        if (!/^[a-z0-9_]+$/.test(role)) throw new Error('Unsafe fixture name.');
        const password = randomBytes(24).toString('hex');
        await administrator.query(
          `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
        );
        const item = { role, databaseCreated: false };
        provisioned.push(item);
        await administrator.query(`CREATE DATABASE ${role} OWNER ${role}`);
        item.databaseCreated = true;
        await administrator.query(`REVOKE ALL ON DATABASE ${role} FROM PUBLIC`);
        const own = new URL(raw);
        own.username = role;
        own.password = password;
        own.pathname = `/${role}`;
        connectionStrings.set(name as Service, own.toString());
        const repository = new PgRepository(name, own.toString(), config.tables, config.migrations);
        repositories.set(name as Service, repository);
        await repository.migrate();
      }
    } else
      for (const [name, config] of Object.entries(storage))
        repositories.set(name as Service, new MemoryRepository(name, config.tables));
    const repo = (name: Service) => {
      const value = repositories.get(name);
      if (!value) throw new Error(`Missing ${name}`);
      return value;
    };
    async function listen(app: FastifyInstance) {
      apps.push(app);
      return app.listen({ host: '127.0.0.1', port: 0 });
    }
    let crmApp = crm({ auth, repository: repo('crm') });
    const crmUrl = await listen(crmApp);
    const directory = new HttpCustomerDirectory(crmUrl);
    const upstreams = {
      crm: crmUrl,
      identity: await listen(identity({ auth, repository: repo('identity') })),
      sales: await listen(sales({ auth, repository: repo('sales'), customerDirectory: directory })),
      delivery: await listen(delivery({ auth, repository: repo('delivery') })),
      billing: await listen(billing({ auth, repository: repo('billing') })),
      communications: await listen(
        communications({ auth, repository: repo('communications'), customerDirectory: directory }),
      ),
      tracking: await listen(tracking({ auth, repository: repo('tracking') })),
    };
    let failNextRead = false;
    let dropNextWrite = false;
    const app = gateway({
      auth,
      upstreams,
      fetcher: async (input, init) => {
        const method = init?.method ?? 'GET';
        if (failNextRead && method === 'GET' && String(input).includes('/customers')) {
          failNextRead = false;
          throw new Error('Deliberate test-only network outage');
        }
        const response = await fetch(input, init);
        if (dropNextWrite && method !== 'GET' && response.ok) {
          dropNextWrite = false;
          await response.arrayBuffer();
          throw new Error('Deliberate lost response after service commit');
        }
        return response;
      },
    });
    const bundle = await build({
      absWorkingDir: root,
      stdin: {
        contents: `import { mountAdminWorkspace } from './apps/admin-web/src/server/workspace.ts'; import { mountAuthenticatedWorkspace } from './packages/api-client/src/authenticated-workspace.ts'; const root=document.getElementById('app'); const token=${JSON.stringify(admin)}; const selected=new URL(location.href).searchParams.get('role')==='rep'?${JSON.stringify(rep)}:token; mountAuthenticatedWorkspace({root,role:'admin',baseUrl:location.origin,environment:'development',externalAccessToken:()=>selected,mountWorkspace:mountAdminWorkspace}).then(remove=>window.addEventListener('pagehide',()=>void remove(),{once:true})).catch(()=>{root.textContent='ADMIN_ACCESS_DENIED';});`,
        resolveDir: root,
        loader: 'ts',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
    });
    const output = bundle.outputFiles[0];
    if (!output) throw new Error('Test entry did not build.');
    const css = await readFile(resolve(root, 'apps/admin-web/src/server/styles.css'), 'utf8');
    app.get('/', async (_request, reply) =>
      reply
        .type('text/html')
        .send(
          '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Admin E2E</title><link rel="stylesheet" href="/app.css"><div id="app"></div><script src="/app.js"></script></html>',
        ),
    );
    app.get('/app.js', async (_request, reply) =>
      reply.type('application/javascript').send(output.text),
    );
    app.get('/app.css', async (_request, reply) => reply.type('text/css').send(css));
    const url = await listen(app);
    async function call(
      path: string,
      method = 'GET',
      body?: Record<string, unknown>,
      access = admin,
      key = randomUUID(),
    ) {
      const response = await fetch(url + path, {
        method,
        headers: {
          Authorization: `Bearer ${access}`,
          ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, data: (await response.json()) as Record<string, unknown> };
    }
    /** Deterministic test-only outbox/inbox driver, explicitly NOT RabbitMQ verification. */
    async function drainEvents() {
      const consumers: Partial<
        Record<Service, { subscriptions: readonly string[]; handleEvent: EventHandler }>
      > = {
        crm: crmEvents,
        sales: salesEvents,
        delivery: deliveryEvents,
        billing: billingEvents,
        communications: communicationsEvents,
      };
      for (let iteration = 0; iteration < 50; iteration++) {
        let count = 0;
        for (const repository of repositories.values())
          for (const pending of await repository.leaseOutbox(200)) {
            count++;
            for (const [name, consumer] of Object.entries(consumers))
              if (consumer.subscriptions.includes(pending.event.type))
                await consumeEvent(
                  repo(name as Service),
                  `s05-${name}`,
                  pending.event,
                  consumer.handleEvent,
                );
            await repository.markPublished(pending.event.id, pending.leaseToken);
          }
        if (count === 0) return;
      }
      throw new Error('Test outbox did not settle within its bound.');
    }
    async function reopenCrm() {
      await crmApp.close();
      if (mode === 'postgres') {
        const previous = repo('crm');
        if (previous instanceof PgRepository) await previous.close();
        const connection = connectionStrings.get('crm');
        if (!connection) throw new Error('Missing CRM test database connection');
        repositories.set(
          'crm',
          new PgRepository('crm', connection, storage.crm.tables, storage.crm.migrations),
        );
      }
      crmApp = crm({ auth, repository: repo('crm') });
      apps.push(crmApp);
      await crmApp.listen({ host: '127.0.0.1', port: Number(new URL(crmUrl).port) });
    }
    return {
      url,
      mode,
      call,
      token,
      admin,
      rep,
      outsider,
      close,
      reopenCrm,
      drainEvents,
      failRead: () => {
        failNextRead = true;
      },
      loseResponse: () => {
        dropNextWrite = true;
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
