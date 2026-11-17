export {};

declare global {
  interface Window {
    ELVORANCE_CONFIG?: Readonly<{
      dataMode: 'demo' | 'server';
      configurationApiBaseUrl?: string;
      apiBaseUrl?: string;
      siteTracking?: boolean;
    }>;
    ELVORANCE_AUTH?: {
      getAccessToken?: () => string | null | Promise<string | null>;
    };
    ElvoranceConfigurationSync?: unknown;
  }
}
