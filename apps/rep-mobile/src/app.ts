// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import { createContext } from './context.ts';
import { createLocalDemo } from './state/local-demo.ts';
import { createLifecycle } from './lifecycle.ts';
import { createDashboardFeature } from './features/dashboard/index.ts';
import { createTerritoryFeature } from './features/territory/index.ts';
import { createCustomersFeature } from './features/customers/index.ts';
import { createVisitsFeature } from './features/visits/index.ts';
import { createDiscoveryFeature } from './features/discovery/index.ts';
import { createCatalogFeature } from './features/catalog/index.ts';
import { createOpportunitiesFeature } from './features/opportunities/index.ts';
import { createQuotesFeature } from './features/quotes/index.ts';
import { createTasksFeature } from './features/tasks/index.ts';
import { createMessagesFeature } from './features/messages/index.ts';
import { createAccountFeature } from './features/account/index.ts';

/** Compose independently scoped features. The caller installs the runtime first. */
export function registerApp(A = window.Elvorance) {
  const context = createContext(A);
  // Explicit ports allow visits/quotes and contracts/quotes to collaborate without
  // importing another feature's private state or introducing ESM import cycles.
  const ports = {
    state: {},
    dashboard: {},
    territory: {},
    customers: {},
    visits: {},
    discovery: {},
    catalog: {},
    opportunities: {},
    quotes: {},
    tasks: {},
    messages: {},
    account: {},
  };
  const local = createLocalDemo(context, {
    quotes: ports['quotes'],
  });
  Object.assign(ports.state, local.api);
  const features = [];
  const dashboardFeature = createDashboardFeature(context, {
    territory: ports['territory'],
  });
  features.push(dashboardFeature);
  Object.assign(ports['dashboard'], dashboardFeature.api);
  const territoryFeature = createTerritoryFeature(context);
  features.push(territoryFeature);
  Object.assign(ports['territory'], territoryFeature.api);
  const customersFeature = createCustomersFeature(context, {
    quotes: ports['quotes'],
    state: ports['state'],
  });
  features.push(customersFeature);
  Object.assign(ports['customers'], customersFeature.api);
  const visitsFeature = createVisitsFeature(context, {
    customers: ports['customers'],
    quotes: ports['quotes'],
    state: ports['state'],
  });
  features.push(visitsFeature);
  Object.assign(ports['visits'], visitsFeature.api);
  const discoveryFeature = createDiscoveryFeature(context, { state: ports['state'] });
  features.push(discoveryFeature);
  Object.assign(ports.discovery, discoveryFeature.api);
  const catalogFeature = createCatalogFeature(context);
  features.push(catalogFeature);
  Object.assign(ports['catalog'], catalogFeature.api);
  const opportunitiesFeature = createOpportunitiesFeature(context, {
    quotes: ports['quotes'],
    state: ports['state'],
    visits: ports['visits'],
  });
  features.push(opportunitiesFeature);
  Object.assign(ports['opportunities'], opportunitiesFeature.api);
  const quotesFeature = createQuotesFeature(context, {
    state: ports['state'],
    visits: ports['visits'],
  });
  features.push(quotesFeature);
  Object.assign(ports['quotes'], quotesFeature.api);
  const tasksFeature = createTasksFeature(context, {
    state: ports['state'],
  });
  features.push(tasksFeature);
  Object.assign(ports['tasks'], tasksFeature.api);
  const messagesFeature = createMessagesFeature(context, {
    state: ports['state'],
  });
  features.push(messagesFeature);
  Object.assign(ports['messages'], messagesFeature.api);
  const accountFeature = createAccountFeature(context, {
    state: ports['state'],
  });
  features.push(accountFeature);
  Object.assign(ports['account'], accountFeature.api);
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
  local.api.decorateActions(actions);
  const definition = {
    id: 'rep',
    name: 'إلفورانس للمندوب',
    subtitle: 'مساحة المبيعات الميدانية',
    home: 'home',
    nav: [
      {
        id: 'home',
        label: 'اليوم',
        icon: 'home',
      },
      {
        id: 'territory',
        label: 'المسار',
        icon: 'map',
      },
      {
        id: 'clients',
        label: 'العملاء',
        icon: 'users',
      },
      {
        id: 'opportunities',
        label: 'الفرص',
        icon: 'briefcase',
      },
      {
        id: 'more',
        label: 'المزيد',
        icon: 'more',
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
