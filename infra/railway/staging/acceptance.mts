import { randomUUID } from 'node:crypto';
import { createIdentityFixtures } from './identity-fixture.mts';
import { hostedJourney } from './journey.mts';
import { policyChecks } from './policy-checks.mts';
import { sustainedLoad } from './load.mts';
import { recovery } from './recovery.mts';
import { assertStaging, ensure, sourceRevision } from './target.mts';
export async function runHostedAcceptance() {
  assertStaging();
  const startedAt = new Date().toISOString();
  const source = sourceRevision();
  const tenantId = 'stg-accept-' + randomUUID();
  const identities = await createIdentityFixtures();
  const report: Record<string, unknown> = {
    schemaVersion: 1,
    scope: 'Hosted staging engineering acceptance with synthetic accounts',
    source,
    startedAt,
    tenantId,
    keycloak: identities.keycloak,
    passed: false,
  };
  let success = false;
  try {
    const flow = await hostedJourney(identities, tenantId);
    report.journey = flow.report;
    report.policy = await policyChecks(identities, flow, tenantId);
    report.requests = flow.http.observations;
    const load = await sustainedLoad(flow.admin);
    report.load = load;
    ensure(load.passed, 'Proposed sustained-load engineering budget was not met.');
    report.recovery = await recovery(tenantId, flow.recoveryReplay);
    success = true;
  } finally {
    try {
      report.accountCleanup = await identities.cleanup();
    } catch {
      success = false;
      report.accountCleanup = {
        passed: false,
        message: 'Fixture cleanup incomplete; inspect restricted operator logs.',
      };
    }
    report.completedAt = new Date().toISOString();
    report.passed = success;
    report.releaseApproval = false;
    report.fixtureData =
      'Synthetic tenant business records retained for review, isolated by tenant; temporary accounts and restore databases removed.';
    console.log('ELVORANCE_ACCEPTANCE ' + JSON.stringify(report));
  }
  ensure(report.passed, 'Hosted acceptance or fixture cleanup failed.');
  return report;
}
