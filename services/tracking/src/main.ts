import { assertRuntimeStaging, operationLog } from '@elvorance/service-kit';
import { authFromEnv, listen } from '@elvorance/service-kit';
import { startEventRuntime } from '@elvorance/events';
import { createRepository } from './infrastructure/repository.ts';
import { createApp } from './app.ts';
const subscriptions: string[] = [];
const handleEvent = async () => {};

assertRuntimeStaging('tracking');
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
    log: () => console.warn(operationLog('tracking', 'event-retry', 'consumer')),
    diagnostic: (phase, error) =>
      console.warn(operationLog('tracking', 'event-runtime', phase, error)),
  });
  const app = createApp({ repository, auth, logger: true, brokerReady: events.isReady });
  process.env.PORT ??= '3006';
  await listen(app, repository, events.close);
}
