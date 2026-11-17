import { createService, type AppOptions } from '@elvorance/service-kit';
import { registerRoutes } from './transport/routes.ts';
export function createApp(options: AppOptions) {
  const app = createService('billing', options);
  registerRoutes(app, options.repository);
  return app;
}
export { handleEvent, subscriptions } from './application/events.ts';
