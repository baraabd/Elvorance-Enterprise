import type { CustomerDirectory } from '@elvorance/contracts';
import { AppError, createService, type AppOptions } from '@elvorance/service-kit';
import { registerRoutes } from './transport/routes.ts';
import { registerConversationRoutes } from './transport/conversation-routes.ts';
export function createApp(options: AppOptions & { customerDirectory?: CustomerDirectory }) {
  const app = createService('communications', options);
  registerRoutes(app, options.repository);
  registerConversationRoutes(
    app,
    options.repository,
    options.customerDirectory ?? {
      async getCustomer() {
        throw new AppError(503, 'CRM_UNAVAILABLE', 'Customer ownership service is not configured');
      },
    },
  );
  return app;
}
export { handleEvent, subscriptions } from './application/events.ts';
