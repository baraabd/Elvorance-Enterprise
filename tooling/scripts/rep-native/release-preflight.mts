import { repReleaseConfig } from '../rep-release/release-config.mts';
import { nativeIdentity, releaseVersion } from './config.mts';
import { domains } from '../../../infra/environments/topology.mts';

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
const health = await fetch(`${config.apiBaseUrl}/ready`, {
  signal: AbortSignal.timeout(15000),
  redirect: 'error',
});
if (!health.ok) throw new Error('The selected gateway and its services are not ready.');
const readiness = (await health.json()) as {
  service?: string;
  status?: string;
  dependencies?: Record<string, unknown>;
};
if (
  readiness.service !== 'api-gateway' ||
  readiness.status !== 'ready' ||
  !domains.every((name) => readiness.dependencies?.[name] === true)
)
  throw new Error('The selected gateway did not verify readiness of all domain services.');
console.log(
  `Release configuration and endpoint readiness checked for ${config.environment}. This is not device acceptance.`,
);
