import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createWebServer } from '../../infra/railway/staging/web-server.mts';
test('hosted static shell denies path traversal and writes; keeps config uncached with script CSP', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'elvorance-web-'));
  for (const name of ['index.html', 'app.js', 'config.js', 'styles.css'])
    await writeFile(join(dir, name), name);
  await writeFile(
    join(dir, 'build.json'),
    JSON.stringify({ role: 'client', source: 'a'.repeat(40), environment: 'staging' }),
  );
  const app = await createWebServer('client', dir);
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const base = 'http://127.0.0.1:' + (app.address() as AddressInfo).port;
  try {
    for (const path of ['/', '/callback?code=test&state=test', '/config.js']) {
      const r = await fetch(base + path);
      assert.equal(r.status, 200);
      await r.text();
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.match(r.headers.get('content-security-policy')!, /script-src 'self';/);
    }
    for (const path of ['/.env', '/%2e%2e%2fpackage.json', '/package.json', '/../server.mjs']) {
      const r = await fetch(base + path);
      assert.equal(r.status, 404);
      await r.text();
    }
    const post = await fetch(base + '/config.js', { method: 'POST' });
    assert.equal(post.status, 405);
    await post.text();
    const head = await fetch(base + '/config.js', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally {
    await new Promise<void>((resolve, reject) => app.close((e) => (e ? reject(e) : resolve())));
    await rm(dir, { recursive: true, force: true });
  }
});
