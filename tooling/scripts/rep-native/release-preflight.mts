import { repReleaseConfig } from '../rep-release/release-config.mts';
import { nativeIdentity, releaseVersion } from './config.mts';

const config = repReleaseConfig();
releaseVersion();
const identity = nativeIdentity(config);
const response = await fetch(`${config.auth.issuer}/.well-known/openid-configuration`, {
  signal: AbortSignal.timeout(15000),
  redirect: 'error',
});
if (!response.ok) throw new Error('The selected environment OIDC discovery endpoint is not ready.');
const discovery = (await response.json()) as Record<string, unknown>;
if (
  discovery.issuer !== config.auth.issuer ||
  discovery.authorization_endpoint !== identity.authorizationEndpoint
) {
  throw new Error('OIDC discovery does not match the native authorization endpoint pin.');
}
const health = await fetch(`${config.apiBaseUrl}/health`, {
  signal: AbortSignal.timeout(15000),
  redirect: 'error',
});
if (!health.ok) throw new Error('The selected gateway is not healthy.');
console.log(
  `Release configuration and endpoint readiness checked for ${config.environment}. This is not device acceptance.`,
);
