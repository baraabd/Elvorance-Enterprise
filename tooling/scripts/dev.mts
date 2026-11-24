import { createServer } from 'node:http';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { root, apps } from './workspace.mts';

await import('./build-apps.mts');
const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
};
const app = apps.find((item) => args.includes(item.folder));
const folder = resolve(root, app ? `apps/${app.folder}/dist` : 'dist');
const port = Number(flag('--port', process.env.PORT || '4173'));
const host = flag('--host', '127.0.0.1');
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.zip': 'application/zip',
};
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url || '/', 'http://local').pathname);
    let file = resolve(folder, '.' + path);
    if (file !== folder && !file.startsWith(folder + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
    let handle = await open(file, flags);
    let data: Buffer;
    try {
      if ((await handle.stat()).isDirectory()) {
        await handle.close();
        file = resolve(file, 'index.html');
        handle = await open(file, flags);
      }
      if (!(await handle.stat()).isFile()) throw new Error('A regular asset is required.');
      data = await handle.readFile();
    } finally {
      await handle.close();
    }
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found. Backend APIs run separately through the API Gateway.');
  }
});
server.listen(port, host, () =>
  console.log(`Elvorance ${app?.folder || 'suite'}: http://${host}:${port}`),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.close(() => process.exit(0)));
