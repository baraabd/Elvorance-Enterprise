// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import { createContext } from './context.ts';
import { createLocalDemo } from './state/local-demo.ts';
import { createLifecycle } from './lifecycle.ts';
import { createDashboardFeature } from './features/dashboard/index.ts';
import { createCatalogFeature } from './features/catalog/index.ts';
import { createClientDiscoveryFeature } from './features/discovery/index.ts';
import { createQuotesFeature } from './features/quotes/index.ts';
import { createContractsFeature } from './features/contracts/index.ts';
import { createProjectsFeature } from './features/projects/index.ts';
import { createBillingFeature } from './features/billing/index.ts';
import { createSupportFeature } from './features/support/index.ts';
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
    catalog: {},
    discovery: {},
    quotes: {},
    contracts: {},
    projects: {},
    billing: {},
    support: {},
    messages: {},
    account: {},
  };
  const local = createLocalDemo(context);
  Object.assign(ports.state, local.api);
  const features = [];
  const dashboardFeature = createDashboardFeature(context, {
    projects: ports['projects'],
    quotes: ports['quotes'],
  });
  features.push(dashboardFeature);
  Object.assign(ports['dashboard'], dashboardFeature.api);
  const catalogFeature = createCatalogFeature(context, {
    state: ports['state'],
  });
  features.push(catalogFeature);
  Object.assign(ports['catalog'], catalogFeature.api);
  const discoveryFeature=createClientDiscoveryFeature(context,{state:ports['state']});
  features.push(discoveryFeature);
  Object.assign(ports.discovery,discoveryFeature.api);
  const quotesFeature = createQuotesFeature(context, {
    contracts: ports['contracts'],
    state: ports['state'],
  });
  features.push(quotesFeature);
  Object.assign(ports['quotes'], quotesFeature.api);
  const contractsFeature = createContractsFeature(context, {
    quotes: ports['quotes'],
    state: ports['state'],
  });
  features.push(contractsFeature);
  Object.assign(ports['contracts'], contractsFeature.api);
  const projectsFeature = createProjectsFeature(context, {
    state: ports['state'],
  });
  features.push(projectsFeature);
  Object.assign(ports['projects'], projectsFeature.api);
  const billingFeature = createBillingFeature(context, {
    state: ports['state'],
  });
  features.push(billingFeature);
  Object.assign(ports['billing'], billingFeature.api);
  const supportFeature = createSupportFeature(context, {
    state: ports['state'],
  });
  features.push(supportFeature);
  Object.assign(ports['support'], supportFeature.api);
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
  const definition = {
    id: 'client',
    name: 'مساحة العميل',
    subtitle: 'كل خطوة، أوضح',
    home: 'home',
    nav: [
      {
        id: 'home',
        label: 'الرئيسية',
        icon: 'home',
      },
      {
        id: 'projects',
        label: 'مشاريعي',
        icon: 'monitor',
      },
      {
        id: 'contracts',
        label: 'العقود',
        icon: 'file',
      },
      {
        id: 'services',
        label: 'الخدمات',
        icon: 'layers',
      },
      {
        id: 'account',
        label: 'حسابي',
        icon: 'user',
      },
    ],
    routes,
    actions,
    afterRender: createLifecycle(context),
  };
  A.register(definition);
  return definition;
}
