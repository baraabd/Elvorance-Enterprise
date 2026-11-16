import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { root, apps } from './workspace.mjs';

await import('./build-apps.mjs');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const app = apps.find((item) => args.includes(item.folder));
const folder = resolve(root, app ? `apps/${app.folder}/dist` : 'dist');
const port = Number(flag('--port', process.env.PORT || '4173'));
const host = flag('--host', '127.0.0.1');
const mime = {
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
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const data = await readFile(file);
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
  console.log(`Atlas ${app?.folder || 'suite'}: http://${host}:${port}`),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.close(() => process.exit(0)));
