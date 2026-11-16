// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import { installConfigurationSync } from '@elvorance/questionnaire/sync';
import { installMobileShell } from '@elvorance/mobile-platform';
import { installRuntime } from '@elvorance/app-runtime';
import { installSiteTracking } from '@elvorance/app-runtime/tracking';
import { registerApp } from './app.ts';

const config = window.ELVORANCE_CONFIG || { dataMode: 'demo', siteTracking: false };
if (config.dataMode !== 'demo') {
  throw new Error(
    'This preserved UI uses the explicit local-demo adapter. Migrate feature commands to the API client before enabling server mode.',
  );
}
const runtime = installRuntime();
export const definition = registerApp(runtime);
installSiteTracking({ runtime, disabled: !config.siteTracking });
runtime.start('rep');
const syncBase = config.configurationApiBaseUrl || '';
if (syncBase) window.ElvoranceConfigurationSync = installConfigurationSync(runtime, {
  baseUrl: syncBase,
  getAccessToken: () => window.ELVORANCE_AUTH?.getAccessToken?.(),
  onStatus: ({connected,error}) => { if (!connected) console.warn('Elvorance configuration sync unavailable:', error); },
});

installMobileShell(runtime).catch((error) =>
  console.error('Native shell initialization failed', error),
);
