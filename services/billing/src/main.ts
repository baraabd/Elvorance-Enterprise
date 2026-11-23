import { assertRuntimeStaging, operationLog } from '@elvorance/service-kit';
import { authFromEnv, listen } from '@elvorance/service-kit';
import { startEventRuntime } from '@elvorance/events';
import { createRepository } from './infrastructure/repository.ts';
import { createApp } from './app.ts';
import { handleEvent, subscriptions } from './application/events.ts';

assertRuntimeStaging('billing');
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
    log: () => console.warn(operationLog('billing', 'event-retry', 'consumer')),
    diagnostic: (phase, error) =>
      console.warn(operationLog('billing', 'event-runtime', phase, error)),
  });
  const app = createApp({ repository, auth, logger: true, brokerReady: events.isReady });
  process.env.PORT ??= '3005';
  await listen(app, repository, events.close);
}
