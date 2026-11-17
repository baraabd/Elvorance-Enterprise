// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
// Public settings only. Never place access tokens or secrets in this file.
window.ELVORANCE_CONFIG = Object.freeze({
  configurationApiBaseUrl: '', // Set with authenticated getAccessToken() provider only.
  dataMode: 'demo',
  apiBaseUrl: 'http://localhost:3000',
  siteTracking: false,
});
