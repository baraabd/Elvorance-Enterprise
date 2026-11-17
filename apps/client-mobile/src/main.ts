import { installConfigurationSync } from '@elvorance/questionnaire/sync';
import { installMobileShell } from '@elvorance/mobile-platform';
import { installRuntime } from '@elvorance/app-runtime';
import { mountLiveWorkspace } from '@elvorance/api-client/live-workspace';
import { installSiteTracking } from '@elvorance/app-runtime/tracking';
import { registerApp } from './app.ts';

const config = window.ELVORANCE_CONFIG ?? { dataMode: 'demo' as const, siteTracking: false };
if (config.dataMode !== 'demo' && config.dataMode !== 'server') {
  throw new Error('Unsupported Elvorance dataMode.');
}
const runtime = config.dataMode === 'demo' ? installRuntime() : null;
export const definition = runtime ? registerApp(runtime) : null;
if (runtime) {
installSiteTracking({ runtime, disabled: !config.siteTracking });
runtime.start('client');
const syncBase = 'configurationApiBaseUrl' in config ? config.configurationApiBaseUrl || '' : '';
if (syncBase)
  window.ElvoranceConfigurationSync = (
    installConfigurationSync as unknown as (
      runtime: ReturnType<typeof installRuntime>,
      options: {
        baseUrl: string;
        getAccessToken: () => string | null | undefined | Promise<string | null>;
        onStatus: (status: { connected: boolean; error?: string }) => void;
      },
    ) => unknown
  )(runtime, {
    baseUrl: syncBase,
    getAccessToken: () => window.ELVORANCE_AUTH?.getAccessToken?.(),
    onStatus: ({ connected, error }: { connected: boolean; error?: string }) => {
      if (!connected) console.warn('Elvorance configuration sync unavailable:', error);
    },
  });

installMobileShell(runtime).catch((error: unknown) =>
  console.error('Native shell initialization failed', error),
);

} else {
  const root = document.getElementById('app');
  if (!root) throw new Error('Elvorance application root does not exist.');
  const apiBaseUrl =
    'apiBaseUrl' in config && typeof config.apiBaseUrl === 'string'
      ? config.apiBaseUrl
      : 'http://127.0.0.1:3000';
  void mountLiveWorkspace({
    root,
    role: 'client',
    baseUrl: apiBaseUrl,
    accessToken: async () => (await window.ELVORANCE_AUTH?.getAccessToken?.()) ?? null,
  }).catch((error: unknown) => {
    console.error('Elvorance authenticated API startup failed', error);
    root.textContent = 'تعذّر بدء مساحة البيانات الحية. تحقق من إعدادات API.';
  });
}
