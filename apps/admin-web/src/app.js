import { createContext } from './context.js';
import { createLocalDemo } from './state/local-demo.js';
import { createLifecycle } from './lifecycle.js';
import { createDashboardFeature } from './features/dashboard/index.js';
import { createWorkforceFeature } from './features/workforce/index.js';
import { createTerritoriesFeature } from './features/territories/index.js';
import { createCustomersFeature } from './features/customers/index.js';
import { createPipelineFeature } from './features/pipeline/index.js';
import { createTasksFeature } from './features/tasks/index.js';
import { createApprovalsFeature } from './features/approvals/index.js';
import { createProjectsFeature } from './features/projects/index.js';
import { createAnalyticsFeature } from './features/analytics/index.js';
import { createBillingFeature } from './features/billing/index.js';
import { createSupportFeature } from './features/support/index.js';
import { createMessagesFeature } from './features/messages/index.js';
import { createSettingsFeature } from './features/settings/index.js';
import { createConfigurationFeature } from './features/configuration/index.js';

/** Compose independently scoped features. The caller installs the runtime first. */
export function registerApp(A = window.Atlas) {
  const context = createContext(A);
  // Explicit ports allow visits/quotes and contracts/quotes to collaborate without
  // importing another feature's private state or introducing ESM import cycles.
  const ports = {
    state: {},
    dashboard: {},
    workforce: {},
    territories: {},
    customers: {},
    pipeline: {},
    tasks: {},
    approvals: {},
    projects: {},
    analytics: {},
    billing: {},
    support: {},
    messages: {},
    settings: {},
    configuration: {},
  };
  const local = createLocalDemo(context);
  Object.assign(ports.state, local.api);
  const features = [];
  const dashboardFeature = createDashboardFeature(context, {
    workforce: ports['workforce'],
  });
  features.push(dashboardFeature);
  Object.assign(ports['dashboard'], dashboardFeature.api);
  const workforceFeature = createWorkforceFeature(context, {
    pipeline: ports['pipeline'],
    state: ports['state'],
  });
  features.push(workforceFeature);
  Object.assign(ports['workforce'], workforceFeature.api);
  const territoriesFeature = createTerritoriesFeature(context, {
    customers: ports['customers'],
    state: ports['state'],
    workforce: ports['workforce'],
  });
  features.push(territoriesFeature);
  Object.assign(ports['territories'], territoriesFeature.api);
  const customersFeature = createCustomersFeature(context, {
    pipeline: ports['pipeline'],
    state: ports['state'],
    workforce: ports['workforce'],
  });
  features.push(customersFeature);
  Object.assign(ports['customers'], customersFeature.api);
  const pipelineFeature = createPipelineFeature(context, {
    state: ports['state'],
  });
  features.push(pipelineFeature);
  Object.assign(ports['pipeline'], pipelineFeature.api);
  const tasksFeature = createTasksFeature(context, {
    state: ports['state'],
  });
  features.push(tasksFeature);
  Object.assign(ports['tasks'], tasksFeature.api);
  const approvalsFeature = createApprovalsFeature(context, {
    state: ports['state'],
  });
  features.push(approvalsFeature);
  Object.assign(ports['approvals'], approvalsFeature.api);
  const projectsFeature = createProjectsFeature(context, {
    state: ports['state'],
  });
  features.push(projectsFeature);
  Object.assign(ports['projects'], projectsFeature.api);
  const analyticsFeature = createAnalyticsFeature(context, {
    workforce: ports['workforce'],
  });
  features.push(analyticsFeature);
  Object.assign(ports['analytics'], analyticsFeature.api);
  const billingFeature = createBillingFeature(context, {
    state: ports['state'],
  });
  features.push(billingFeature);
  Object.assign(ports['billing'], billingFeature.api);
  const supportFeature = createSupportFeature(context, {
    messages: ports['messages'],
    state: ports['state'],
  });
  features.push(supportFeature);
  Object.assign(ports['support'], supportFeature.api);
  const messagesFeature = createMessagesFeature(context, {
    state: ports['state'],
  });
  features.push(messagesFeature);
  Object.assign(ports['messages'], messagesFeature.api);
  const settingsFeature = createSettingsFeature(context, {
    state: ports['state'],
  });
  features.push(settingsFeature);
  Object.assign(ports['settings'], settingsFeature.api);
  const configurationFeature = createConfigurationFeature(context, {state:ports['state']});
  features.push(configurationFeature);
  Object.assign(ports['configuration'],configurationFeature.api);
  const routes = {},
    actions = {
      ...local.actions,
    };
  for (const feature of features) {
    for (const [id, route] of Object.entries(feature.routes)) {
      if (routes[id]) throw new Error('Duplicate route: ' + id);
      routes[id] = route;
    }
    for (const [id, action] of Object.entries(feature.actions)) {
      if (actions[id]) throw new Error('Duplicate action: ' + id);
      actions[id] = action;
    }
  }
  const definition = {
    id: 'admin',
    name: 'أطلس للإدارة',
    subtitle: 'رؤية أوضح. قرارات أقرب.',
    home: 'home',
    nav: [
      {
        id: 'home',
        label: 'الرئيسية',
        icon: 'home',
      },
      {
        id: 'team',
        label: 'الفريق',
        icon: 'users',
      },
      {
        id: 'territories',
        label: 'المناطق',
        icon: 'map',
      },
      {
        id: 'pipeline',
        label: 'الفرص',
        icon: 'briefcase',
      },
      {
        id: 'more',
        label: 'المزيد',
        icon: 'menu',
      },
    ],
    routes,
    actions,
    afterRender: createLifecycle(context, {
      state: ports['state'],
    }),
  };
  A.register(definition);
  return definition;
}
