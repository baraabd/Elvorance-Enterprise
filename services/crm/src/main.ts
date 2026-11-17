import { authFromEnv, listen } from '@elvorance/service-kit';
import { startEventRuntime } from '@elvorance/events';
import { createRepository } from './infrastructure/repository.ts';
import { createApp } from './app.ts';
import { handleEvent, subscriptions } from './application/events.ts';

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
    log: (message) => console.warn('[crm]', message),
  });
  const app = createApp({ repository, auth, logger: true, brokerReady: events.isReady });
  process.env.PORT ??= '3002';
  await listen(app, repository, events.close);
}
