import { createService, type AppOptions } from '@atlas/service-kit';
import { registerRoutes } from './transport/routes.ts';
export function createApp(options: AppOptions) {
  const app = createService('tracking', options);
  registerRoutes(app, options.repository);
  return app;
}
