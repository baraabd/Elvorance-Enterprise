import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { MemoryRepository } from '@elvorance/service-kit';
import { repFixture } from '../backend/rep-fixture.ts';
import { auth } from '../backend/helpers.ts';
import { createApp as trackingApp } from '../../services/tracking/src/app.ts';
import { createApp as billingApp } from '../../services/billing/src/app.ts';
import { createApp as deliveryApp } from '../../services/delivery/src/app.ts';
import { tables as trackingTables } from '../../services/tracking/src/infrastructure/migrations/001_initial.ts';
import { tables as billingTables } from '../../services/billing/src/infrastructure/migrations/001_initial.ts';
import { tables as deliveryTables } from '../../services/delivery/src/infrastructure/migrations/001_initial.ts';

if (process.env.ELVORANCE_SYNTHETIC_BROWSER !== 'loopback-only')
  throw new Error('Explicit synthetic loopback test opt-in is required.');

test(
  'isolated browser fixture lifetime (memory persistence and synthetic identities)',
  { timeout: 300_000 },
  async (t) => {
    const fixture = await repFixture(t);
    await fixture.publish();
    const extra = [
      trackingApp({ repository: new MemoryRepository('tracking', trackingTables), auth }),
      billingApp({ repository: new MemoryRepository('billing', billingTables), auth }),
      deliveryApp({ repository: new MemoryRepository('delivery', deliveryTables), auth }),
    ];
    t.after(async () => {
      await Promise.all(extra.map((app) => app.close()));
    });
    const services: Record<string, FastifyInstance> = {
      crm: fixture.crm,
      sales: fixture.sales,
      identity: fixture.identity,
      communications: fixture.communications,
      tracking: extra[0],
      billing: extra[1],
      delivery: extra[2],
    };
    const script = await readFile('dist/browser/app.js');
    const styles = await readFile('dist/browser/app.css');
    let host = '';
    const server = createServer((request, response) => {
      void (async () => {
        if (request.headers.host !== host) {
          response.writeHead(403).end();
          return;
        }
        const url = new URL(request.url ?? '/', 'http://' + host);
        if (request.method === 'GET' && url.pathname === '/') {
          response.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
          });
          response.end(
            '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><title>Elvorance synthetic browser fixture</title></head><body><div id="app"></div><script type="module" src="/app.js"></script></body></html>',
          );
          return;
        }
        if (request.method === 'GET' && ['/app.js', '/app.css'].includes(url.pathname)) {
          response.writeHead(200, {
            'content-type': url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css',
          });
          response.end(url.pathname.endsWith('.js') ? script : styles);
          return;
        }
        const service = services[url.pathname.split('/')[2] ?? ''];
        if (!url.pathname.startsWith('/v1/') || !service) {
          response.writeHead(404).end();
          return;
        }
        let body = '';
        for await (const chunk of request) {
          body += String(chunk);
          if (Buffer.byteLength(body) > 1024 * 1024) {
            response.writeHead(413).end();
            return;
          }
        }
        // Real production handlers, validators and authorization; only storage/identity are test ports.
        const result = await service.inject({
          method: request.method as 'GET' | 'POST' | 'PATCH' | 'PUT',
          url: url.pathname.replace(/^\/v1\/[^/]+/, '/v1') + url.search,
          headers: request.headers,
          ...(body ? { payload: body } : {}),
        });
        response.writeHead(result.statusCode, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        response.end(result.body);
      })().catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing loopback address.');
    host = `127.0.0.1:${address.port}`;
    t.after(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    console.log('BROWSER_READY ' + JSON.stringify({ origin: 'http://' + host }));
    await new Promise<void>((resolve) => process.once('SIGTERM', resolve));
  },
);
