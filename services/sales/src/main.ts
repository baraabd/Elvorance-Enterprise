import { assertRuntimeStaging, operationLog } from '@elvorance/service-kit';
import { authFromEnv, listen } from '@elvorance/service-kit';
import { startEventRuntime } from '@elvorance/events';
import { createRepository } from './infrastructure/repository.ts';
import { createApp } from './app.ts';
import { HttpCustomerDirectory } from './infrastructure/crm-client.ts';
import { handleEvent, subscriptions } from './application/events.ts';

assertRuntimeStaging('sales');
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
    log: () => console.warn(operationLog('sales', 'event-retry', 'consumer')),
    diagnostic: (phase, error) =>
      console.warn(operationLog('sales', 'event-runtime', phase, error)),
  });
  const app = createApp({
    repository,
    auth,
    logger: true,
    brokerReady: events.isReady,
    customerDirectory: new HttpCustomerDirectory(process.env.CRM_URL ?? 'http://localhost:3002'),
  });
  process.env.PORT ??= '3003';
  await listen(app, repository, events.close);
}
