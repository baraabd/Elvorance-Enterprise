import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionsAppId,
  requiredCheck,
  minimumProtection,
  protectionPlan,
  protectionProblems,
} from '../../tooling/production/branch-protection.mts';
function live() {
  return {
    required_status_checks: {
      strict: true,
      checks: [{ context: requiredCheck, app_id: actionsAppId }],
    },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true,
      require_last_push_approval: true,
      required_approving_review_count: 1,
    },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    required_conversation_resolution: { enabled: true },
  };
}
test('only live enabled settings establish governance; the proposed PUT body cannot pass readback', () => {
  assert.deepEqual(protectionProblems(live()), []);
  assert.ok(protectionProblems(minimumProtection()).length > 0);
  assert.ok(protectionProblems(null).length > 0);
});
test('contexts-only or any-app required checks cannot masquerade as trusted FULL-CI', () => {
  const base = live();
  assert.ok(
    protectionProblems({
      ...base,
      required_status_checks: { strict: true, contexts: [requiredCheck] },
    }).length > 0,
  );
  base.required_status_checks.checks = [{ context: requiredCheck, app_id: -1 }];
  assert.ok(protectionProblems(base).length > 0);
});
test('duplicate required contexts are rejected, including an untrusted provider', () => {
  const base = live();
  base.required_status_checks.checks.push({ context: requiredCheck, app_id: -1 });
  assert.ok(protectionProblems(base).length > 0);
});
test('strict up-to-date checks and administrator enforcement are mandatory', () => {
  const base = live();
  base.required_status_checks.strict = false;
  assert.ok(protectionProblems(base).length > 0);
  const admin = live();
  admin.enforce_admins.enabled = false;
  assert.ok(protectionProblems(admin).length > 0);
});
test('stale, self-last-push or absent code-owner review policies cannot pass', () => {
  for (const field of [
    'dismiss_stale_reviews',
    'require_code_owner_reviews',
    'require_last_push_approval',
  ] as const) {
    const base = live();
    base.required_pull_request_reviews[field] = false;
    assert.ok(protectionProblems(base).length > 0, field);
  }
});
test('at least one independent review is required and review bypass is rejected', () => {
  const base = live();
  base.required_pull_request_reviews.required_approving_review_count = 0;
  assert.ok(protectionProblems(base).length > 0);
  const bypass = live();
  assert.ok(
    protectionProblems({
      ...bypass,
      required_pull_request_reviews: {
        ...bypass.required_pull_request_reviews,
        bypass_pull_request_allowances: { users: [{ login: 'owner' }], teams: [], apps: [] },
      },
    }).length > 0,
  );
});
test('force push, branch deletion and unresolved discussions block governance', () => {
  for (const field of ['allow_force_pushes', 'allow_deletions'] as const) {
    const base = live();
    base[field].enabled = true;
    assert.ok(protectionProblems(base).length > 0);
  }
  const base = live();
  base.required_conversation_resolution.enabled = false;
  assert.ok(protectionProblems(base).length > 0);
});
test('existing protections are never overwritten to satisfy the proposed minimum', () => {
  assert.equal(protectionPlan(null).action, 'ENABLE');
  assert.equal(protectionPlan(live()).action, 'NO_CHANGE');
  assert.equal(
    protectionPlan({ required_status_checks: { contexts: ['other-check'] } }).action,
    'BLOCKED',
  );
});
test('stronger review and additional required checks are preserved', () => {
  const base = live();
  base.required_pull_request_reviews.required_approving_review_count = 2;
  base.required_status_checks.checks.push({
    context: 'Independent security review',
    app_id: 12345,
  });
  assert.deepEqual(protectionProblems(base), []);
  assert.equal(protectionPlan(base).action, 'NO_CHANGE');
});
