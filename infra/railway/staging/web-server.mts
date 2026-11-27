import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stagingTarget, ensure, requiredValue } from './target.mts';
export async function createWebServer(role: string, directory: string) {
  ensure(
    role === 'admin' || role === 'client' || role === 'rep',
    'Unknown hosted web application.',
  );
  const assets = new Map<string, { body: Buffer; type: string }>();
  for (const [name, type] of [
    ['index.html', 'text/html; charset=utf-8'],
    ['app.js', 'text/javascript; charset=utf-8'],
    ['config.js', 'text/javascript; charset=utf-8'],
    ['styles.css', 'text/css; charset=utf-8'],
    ['build.json', 'application/json'],
  ] as const)
    assets.set('/' + name, { body: await readFile(resolve(directory, name)), type });
  const build = JSON.parse(
    requiredValue(assets.get('/build.json'), 'Missing hosted build provenance.').body.toString(),
  ) as {
    source: string;
    role: string;
    environment: string;
  };
  ensure(
    build.role === role && build.environment === 'staging' && /^[a-f0-9]{40}$/.test(build.source),
    'Invalid build provenance.',
  );
  return createServer((req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('strict-transport-security', 'max-age=31536000');
    res.setHeader(
      'content-security-policy',
      `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${stagingTarget.identityOrigin} ${stagingTarget.gatewayOrigin}; base-uri 'none'; frame-ancestors 'none'; form-action 'self' ${stagingTarget.identityOrigin}`,
    );
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      res.end();
      return;
    }
    // Exact allowlist; never resolve an incoming URL into a filesystem path.
    const raw = (req.url ?? '').split('?')[0];
    if (raw === '/ready') {
      res.setHeader('content-type', 'application/json');
      res.end(
        req.method === 'HEAD'
          ? ''
          : JSON.stringify({
              service: role + '-web',
              status: 'ready',
              source: build.source,
              environment: 'staging',
              note: 'Static server readiness, not upstream acceptance.',
            }),
      );
      return;
    }
    const key = raw === '/' || raw === '/callback' ? '/index.html' : raw;
    const asset = assets.get(key ?? '');
    if (!asset) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('content-type', asset.type);
    res.setHeader('content-length', asset.body.length);
    res.end(req.method === 'HEAD' ? undefined : asset.body);
  });
}
