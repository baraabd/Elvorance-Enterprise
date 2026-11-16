import { installConfigurationSync } from '@atlas/questionnaire/sync';
import { installRuntime } from '@atlas/app-runtime';
import { installSiteTracking } from '@atlas/app-runtime/tracking';
import { registerApp } from './app.js';

const config = window.ATLAS_CONFIG || { dataMode: 'demo', siteTracking: false };
if (config.dataMode !== 'demo') {
  throw new Error(
    'This preserved UI uses the explicit local-demo adapter. Migrate feature commands to the API client before enabling server mode.',
  );
}
const runtime = installRuntime();
export const definition = registerApp(runtime);
installSiteTracking({ runtime, disabled: !config.siteTracking });
runtime.start('admin');
const syncBase = config.configurationApiBaseUrl || '';
if (syncBase) window.AtlasConfigurationSync = installConfigurationSync(runtime, {
  baseUrl: syncBase,
  getAccessToken: () => window.ATLAS_AUTH?.getAccessToken?.(),
  onStatus: ({connected,error}) => { if (!connected) console.warn('Atlas configuration sync unavailable:', error); },
});
