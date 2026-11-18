import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { sha256 } from './build-proof.mts';

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
const serviceNames = [
  'api-gateway',
  'identity',
  'crm',
  'sales',
  'delivery',
  'billing',
  'tracking',
  'communications',
];
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
      !['localhost', '127.0.0.1'].includes(url.hostname),
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
    gateway.pathname === '/' && issuer.pathname === '/realms/elvorance-staging',
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
  for (const service of serviceNames)
    ensure(
      typeof report.serviceImages?.[service] === 'string' &&
        /^[a-zA-Z0-9./_-]+@sha256:[a-f0-9]{64}$/.test(report.serviceImages[service]!),
      `immutable image missing for ${service}`,
    );
  ensure(Array.isArray(report.devices), 'physical-device reports missing');
  for (const platform of ['android', 'ios'] as const) {
    const device = report.devices.find((entry) => entry.platform === platform);
    ensure(
      device && device.physical === true && device.model && device.osVersion,
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
      typeof evidence.path === 'string' && /^[a-f0-9]{64}$/.test(evidence.sha256),
      'invalid evidence reference',
    );
    const file = await realpath(resolve(base, evidence.path));
    const path = relative(base, file);
    ensure(
      path && !path.startsWith('..') && !isAbsolute(path),
      'evidence escapes the acceptance artifact',
    );
    ensure(
      sha256(await readFile(file)) === evidence.sha256,
      `evidence digest differs: ${evidence.path}`,
    );
  }
}
