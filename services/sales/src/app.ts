import { createService, type AppOptions } from '@elvorance/service-kit';
import type { CustomerDirectory } from './application/ports.ts';
import { registerRoutes } from './transport/routes.ts';
export interface SalesAppOptions extends AppOptions {
  customerDirectory: CustomerDirectory;
}
export function createApp(options: SalesAppOptions) {
  const app = createService('sales', options);
  registerRoutes(app, options.repository, options.customerDirectory);
  return app;
}
export { handleEvent, subscriptions } from './application/events.ts';
