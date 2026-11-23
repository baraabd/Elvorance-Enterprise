import { installConfigurationSync } from '@elvorance/questionnaire/sync';
import { installRuntime } from '@elvorance/app-runtime';
import { mountAuthenticatedWorkspace } from '@elvorance/api-client/authenticated-workspace';
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
  runtime.start('admin');
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
} else {
  const root = document.getElementById('app');
  if (!root) throw new Error('Elvorance application root does not exist.');
  const apiBaseUrl =
    'apiBaseUrl' in config && typeof config.apiBaseUrl === 'string'
      ? config.apiBaseUrl
      : 'http://127.0.0.1:3000';
  void mountAuthenticatedWorkspace({
    root,
    role: 'admin',
    baseUrl: apiBaseUrl,
    ...('auth' in config && config.auth ? { auth: config.auth } : {}),
    ...('environment' in config && config.environment ? { environment: config.environment } : {}),
    ...(window.ELVORANCE_AUTH?.getAccessToken
      ? { externalAccessToken: () => window.ELVORANCE_AUTH!.getAccessToken!() }
      : {}),
  }).catch(() => {
    root.textContent = 'تعذّر بدء مساحة البيانات الحية. تحقق من إعدادات API وموفر المصادقة الآمن.';
  });
}
