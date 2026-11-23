export {};

declare global {
  interface Window {
    ELVORANCE_CONFIG?: Readonly<{
      dataMode: 'demo' | 'server';
      configurationApiBaseUrl?: string;
      apiBaseUrl?: string;
      siteTracking?: boolean;
      environment?: 'development' | 'staging' | 'production';
      auth?: Readonly<{
        issuer: string;
        clientId: string;
        redirectUri: string;
        environment: 'development' | 'staging' | 'production';
        scopes?: string[];
      }>;
    }>;
    ELVORANCE_AUTH?: {
      getAccessToken?: () => string | null | Promise<string | null>;
    };
    ElvoranceConfigurationSync?: unknown;
  }
}
