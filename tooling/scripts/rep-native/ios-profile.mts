import { nativeIdentity } from './config.mts';
import { repReleaseConfig } from '../rep-release/release-config.mts';

export interface ProvisioningProfile {
  UUID: string;
  TeamIdentifier: string[];
  ApplicationIdentifierPrefix: string[];
  ExpirationDate: string;
  ProvisionedDevices?: string[];
  ProvisionsAllDevices?: boolean;
  Entitlements: Record<string, unknown>;
}

export function validateProfile(
  value: ProvisioningProfile,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const team = env.APPLE_TEAM_ID;
  const method = env.IOS_EXPORT_METHOD;
  const identity = nativeIdentity(repReleaseConfig(env));
  if (
    !team ||
    !/^[A-Z0-9]{10}$/.test(team) ||
    !['app-store-connect', 'release-testing'].includes(method ?? '')
  ) {
    throw new Error(
      'A valid APPLE_TEAM_ID and IOS_EXPORT_METHOD=app-store-connect|release-testing are required.',
    );
  }
  if (
    !/^[A-Fa-f0-9-]{36}$/.test(value.UUID) ||
    !value.TeamIdentifier?.includes(team) ||
    !value.ApplicationIdentifierPrefix?.some(
      (prefix) =>
        value.Entitlements?.['application-identifier'] === `${prefix}.${identity.applicationId}`,
    ) ||
    value.Entitlements?.['get-task-allow'] !== false ||
    !Number.isFinite(Date.parse(value.ExpirationDate)) ||
    Date.parse(value.ExpirationDate) <= Date.now()
  ) {
    throw new Error(
      'The distribution provisioning profile is expired or does not match this team and environment.',
    );
  }
  if (
    value.ProvisionsAllDevices ||
    (method === 'app-store-connect' && (value.ProvisionedDevices?.length ?? 0) > 0) ||
    (method === 'release-testing' && !value.ProvisionedDevices?.length)
  ) {
    throw new Error(
      'Provisioning profile distribution type does not match the requested export method.',
    );
  }
}

const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function exportOptions(
  profile: ProvisioningProfile,
  env: NodeJS.ProcessEnv = process.env,
): string {
  validateProfile(profile, env);
  const identity = nativeIdentity(repReleaseConfig(env));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>${escape(env.IOS_EXPORT_METHOD!)}</string>
<key>destination</key><string>export</string>
<key>teamID</key><string>${escape(env.APPLE_TEAM_ID!)}</string>
<key>signingStyle</key><string>manual</string>
<key>signingCertificate</key><string>Apple Distribution</string>
<key>manageAppVersionAndBuildNumber</key><false/>
<key>provisioningProfiles</key><dict><key>${escape(identity.applicationId)}</key><string>${escape(profile.UUID)}</string></dict>
</dict></plist>\n`;
}
