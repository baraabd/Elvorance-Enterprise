/** Repository governance is verified from live REST data, never inferred from CODEOWNERS.
 * REST contract: https://docs.github.com/en/rest/branches/branch-protection
 * GitHub Actions App ID 15368 was read from the actual final-head check-run on 2026-11-22.
 */
export const requiredCheck = 'FULL-CI / required';
export const actionsAppId = 15368;
export function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
export function minimumProtection() {
  return {
    required_status_checks: {
      strict: true,
      checks: [{ context: requiredCheck, app_id: actionsAppId }],
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true,
      required_approving_review_count: 1,
      require_last_push_approval: true,
    },
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: true,
  };
}
/** Accepts GitHub's GET response (enabled wrappers), NOT a proposed PUT payload. */
export function protectionProblems(value: unknown): string[] {
  const data = object(value);
  if (!data) return ['Live branch-protection response is missing or malformed'];
  const errors: string[] = [];
  const required = object(data.required_status_checks);
  if (required?.strict !== true) errors.push('Required checks are not strict/up-to-date');
  const checks = Array.isArray(required?.checks) ? required.checks : [];
  const matching = checks.map(object).filter((row) => row?.context === requiredCheck);
  if (matching.length !== 1 || matching[0]?.app_id !== actionsAppId)
    errors.push('FULL-CI / required must be bound uniquely to the observed GitHub Actions App');
  if (object(data.enforce_admins)?.enabled !== true)
    errors.push('Administrator bypass is not disabled');
  const review = object(data.required_pull_request_reviews);
  if (
    !Number.isInteger(review?.required_approving_review_count) ||
    Number(review?.required_approving_review_count) < 1
  )
    errors.push('An independent approving review is not required');
  for (const field of [
    'dismiss_stale_reviews',
    'require_code_owner_reviews',
    'require_last_push_approval',
  ])
    if (review?.[field] !== true) errors.push(`Required review policy is not enabled: ${field}`);
  const bypass = review?.bypass_pull_request_allowances;
  if (bypass !== undefined && bypass !== null) {
    const allowances = object(bypass);
    if (
      !allowances ||
      Object.values(allowances).some((entries) => !Array.isArray(entries) || entries.length > 0)
    )
      errors.push('Review-bypass allowances are present or malformed');
  }
  for (const field of ['allow_force_pushes', 'allow_deletions'])
    if (object(data[field])?.enabled !== false) errors.push(`${field} is not explicitly disabled`);
  if (object(data.required_conversation_resolution)?.enabled !== true)
    errors.push('Conversation resolution is not required');
  return errors;
}
export function protectionPlan(existing: unknown | null): {
  action: 'ENABLE' | 'NO_CHANGE' | 'BLOCKED';
  errors: string[];
} {
  if (existing === null) return { action: 'ENABLE', errors: [] };
  const errors = protectionProblems(existing);
  return errors.length
    ? {
        action: 'BLOCKED',
        errors: ['Existing protection must be reviewed, not overwritten or weakened', ...errors],
      }
    : { action: 'NO_CHANGE', errors: [] };
}
