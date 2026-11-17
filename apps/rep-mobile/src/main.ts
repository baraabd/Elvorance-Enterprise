import { installConfigurationSync } from '@elvorance/questionnaire/sync';
import { installMobileShell } from '@elvorance/mobile-platform';
import { installRuntime } from '@elvorance/app-runtime';
import { installSiteTracking } from '@elvorance/app-runtime/tracking';
import { registerApp } from './app.ts';

const config = window.ELVORANCE_CONFIG ?? { dataMode: 'demo' as const, siteTracking: false };
if (config.dataMode !== 'demo') {
  throw new Error(
    'This preserved UI uses the explicit local-demo adapter. Migrate feature commands to the API client before enabling server mode.',
  );
}
const runtime = installRuntime();
export const definition = registerApp(runtime);
installSiteTracking({ runtime, disabled: !config.siteTracking });
runtime.start('rep');
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
