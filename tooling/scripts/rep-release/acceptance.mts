import { open, readFile, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, isAbsolute, extname, sep } from 'node:path';
import { sha256 } from './build-proof.mts';
import { imageNames, immutableImagePattern } from '../../../infra/environments/topology.mts';

export const requiredScenarios = [
  'oidc-pkce-login',
  'refresh-rotation-relaunch',
  'logout-clears-vault',
  'wrong-account-isolation',
  'customers-create-edit',
  'discovery-published-schema',
  'visits-gps-manual-complete',
  'opportunities-tasks-routes',
  'quote-discount-approval',
  'client-response-contract-billing',
  'messages-notifications-support',
  'profile-update',
  'offline-idempotent-retry',
  'location-denied-foreground-stop',
  'background-resume',
  'rtl-accessibility',
] as const;
export interface EvidenceFile {
  path: string;
  sha256: string;
}
export interface DeviceAcceptance {
  platform: 'android' | 'ios';
  physical: true;
  model: string;
  osVersion: string;
  appId: string;
  sourceRevision: string;
  signedArtifactSha256: string;
  scenarios: Record<string, 'passed' | 'failed' | 'pending'>;
  evidence: EvidenceFile[];
}
export interface StagingAcceptance {
  schemaVersion: 1;
  environment: 'staging';
  sourceRevision: string;
  testedAt: string;
  reviewer: string;
  productionPromotionApproved: boolean;
  staging: {
    projectId: string;
    environmentId: string;
    gateway: string;
    issuer: string;
    databaseIsolation: 'passed';
    realmIsolation: 'passed';
  };
  checks: {
    backendPostgres: 'passed';
    oidc: 'passed';
    databaseIsolation: 'passed';
    nativeBuilds: 'passed';
    architecture: 'passed';
    businessFlows: 'passed';
    securityReview: 'passed';
    loadTest: 'passed';
    backupRestore: 'passed';
  };
  serviceImages: Record<string, string>;
  devices: DeviceAcceptance[];
  evidence: EvidenceFile[];
}
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error('Staging acceptance rejected: ' + message);
}
function secure(value: unknown): URL {
  ensure(typeof value === 'string', 'HTTPS endpoint missing');
  const url = new URL(value);
  ensure(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    'invalid staging endpoint',
  );
  return url;
}
export function validateAcceptance(
  input: unknown,
  revision: string,
  now = Date.now(),
): StagingAcceptance {
  ensure(/^[a-f0-9]{40}$/.test(revision), 'expected immutable source SHA missing');
  ensure(input && typeof input === 'object', 'report missing');
  const report = input as StagingAcceptance;
  ensure(
    report.schemaVersion === 1 && report.environment === 'staging',
    'report must come from Staging',
  );
  ensure(report.sourceRevision === revision, 'tested source differs from release source');
  const age = now - Date.parse(report.testedAt);
  ensure(
    Number.isFinite(age) && age >= 0 && age <= 7 * 86_400_000,
    'acceptance must be dated within seven days',
  );
  ensure(
    typeof report.reviewer === 'string' &&
      report.reviewer.trim().length >= 3 &&
      report.productionPromotionApproved === true,
    'named QA approval missing',
  );
  ensure(
    report.staging && report.staging.projectId && report.staging.environmentId,
    'isolated deployment identity missing',
  );
  const gateway = secure(report.staging.gateway);
  const issuer = secure(report.staging.issuer);
  ensure(
    gateway.pathname === '/' &&
      issuer.pathname === '/realms/elvorance-staging' &&
      gateway.hostname !== issuer.hostname,
    'staging gateway or realm mismatch',
  );
  ensure(
    report.staging.databaseIsolation === 'passed' && report.staging.realmIsolation === 'passed',
    'data and identity isolation not proven',
  );
  for (const check of [
    'backendPostgres',
    'oidc',
    'databaseIsolation',
    'nativeBuilds',
    'architecture',
    'businessFlows',
    'securityReview',
    'loadTest',
    'backupRestore',
  ] as const) {
    ensure(report.checks?.[check] === 'passed', `${check} did not pass`);
  }
  for (const service of imageNames)
    ensure(
      typeof report.serviceImages?.[service] === 'string' &&
        immutableImagePattern.test(report.serviceImages[service]!),
      `immutable image missing for ${service}`,
    );
  ensure(Array.isArray(report.devices), 'physical-device reports missing');
  for (const platform of ['android', 'ios'] as const) {
    ensure(
      report.devices.some((entry) => entry?.platform === platform),
      `physical ${platform} evidence missing`,
    );
  }
  for (const device of report.devices) {
    ensure(device && ['android', 'ios'].includes(device.platform), 'unknown device platform');
    const platform = device.platform;
    ensure(
      device.physical === true &&
        typeof device.model === 'string' &&
        device.model.trim().length > 0 &&
        typeof device.osVersion === 'string' &&
        device.osVersion.trim().length > 0,
      `physical ${platform} evidence missing`,
    );
    ensure(
      device.appId === 'com.elvorance.rep.staging' &&
        device.sourceRevision === revision &&
        /^[a-f0-9]{64}$/.test(device.signedArtifactSha256),
      `${platform} build is not the signed staging candidate`,
    );
    for (const scenario of requiredScenarios)
      ensure(device.scenarios?.[scenario] === 'passed', `${platform}/${scenario} has not passed`);
    ensure(
      Array.isArray(device.evidence) && device.evidence.length >= 1,
      `${platform} test files missing`,
    );
    const extension = platform === 'android' ? '.aab' : '.ipa';
    ensure(
      device.evidence.some(
        (entry) =>
          entry &&
          typeof entry.path === 'string' &&
          extname(entry.path).toLowerCase() === extension &&
          entry.sha256 === device.signedArtifactSha256,
      ),
      `${platform} signed ${extension} must be included as matching evidence`,
    );
  }
  ensure(
    Array.isArray(report.evidence) && report.evidence.length >= 1,
    'backend/deployment evidence files missing',
  );
  return report;
}
export async function verifyEvidence(report: StagingAcceptance, directory: string): Promise<void> {
  const base = await realpath(directory);
  for (const evidence of [
    ...report.evidence,
    ...report.devices.flatMap((device) => device.evidence),
  ]) {
    ensure(
      evidence &&
        typeof evidence.path === 'string' &&
        !isAbsolute(evidence.path) &&
        /^[a-f0-9]{64}$/.test(evidence.sha256),
      'invalid evidence reference',
    );
    const file = await realpath(resolve(base, evidence.path));
    const path = relative(base, file);
    ensure(
      path && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path),
      'evidence escapes the acceptance artifact',
    );
    const handle = await open(
      file,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
    );
    try {
      const details = await handle.stat();
      ensure(
        details.isFile() && details.size > 0,
        'evidence must reference a nonempty regular file',
      );
      ensure(
        sha256(await handle.readFile()) === evidence.sha256,
        `evidence digest differs: ${evidence.path}`,
      );
    } finally {
      await handle.close();
    }
  }
}
