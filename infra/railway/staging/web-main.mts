import { resolve } from 'node:path';
import { createWebServer } from './web-server.mts';
import { stagingTarget, ensure } from './target.mts';

ensure(
  process.env.RAILWAY_PROJECT_ID === stagingTarget.projectId &&
    process.env.RAILWAY_ENVIRONMENT_ID === stagingTarget.environmentId,
  'Hosted web runner refuses a different environment.',
);
const role = process.env.WEB_ROLE ?? '';
const server = await createWebServer(role, resolve('dist/hosted-web', role));
const port = Number(process.env.PORT ?? 8080);
ensure(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid port.');
server.listen(port, '::');
