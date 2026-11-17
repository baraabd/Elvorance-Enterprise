import { createService, type AppOptions } from '@elvorance/service-kit';
import { registerRoutes } from './transport/routes.ts';
export function createApp(options: AppOptions) {
  const app = createService('crm', options);
  registerRoutes(app, options.repository);
  return app;
}
