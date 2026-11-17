// Public settings only. Never place access tokens or secrets in this file.
window.ELVORANCE_CONFIG = Object.freeze({
  configurationApiBaseUrl: '', // Set with authenticated getAccessToken() provider only.
  dataMode: 'demo' as const,
  apiBaseUrl: 'http://localhost:3000',
  siteTracking: false,
});
