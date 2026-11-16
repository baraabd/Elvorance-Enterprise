import { authFromEnv, listen } from '@atlas/service-kit';
import { startEventRuntime } from '@atlas/events';
import { createRepository } from './infrastructure/repository.ts';
import { createApp } from './app.ts';
const subscriptions: string[] = [];
const handleEvent = async () => {};

const repository = createRepository(process.env.DATABASE_URL ?? '');
if (process.argv.includes('--migrate-only')) {
  await repository.migrate();
  await repository.close();
} else {
  if (process.env.AUTO_MIGRATE === 'true') await repository.migrate();
  const auth = authFromEnv();
  const events = startEventRuntime({
    repository,
    subscriptions,
    handler: handleEvent,
    log: (message) => console.warn('[identity]', message),
  });
  const app = createApp({ repository, auth, logger: true, brokerReady: events.isReady });
  process.env.PORT ??= '3001';
  await listen(app, repository, events.close);
}
