import { authFromEnv, listen } from '@atlas/service-kit';
import { createApp } from './app.ts';
import { upstreamsFromEnv } from './infrastructure/config.ts';
const app = createApp({
  auth: authFromEnv(),
  upstreams: upstreamsFromEnv(),
  logger: true,
  allowedOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
});
process.env.PORT ??= '3000';
await listen(app);
