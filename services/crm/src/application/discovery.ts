import type { DiscoveryAnswer, DiscoveryRecord, Principal } from '@elvorance/contracts';
import { validateAnswers, type Configuration } from '@elvorance/questionnaire';
import {
  array,
  assert,
  finite,
  integer,
  object,
  oneOf,
  optionalText,
  requireRole,
  text,
  type Transaction,
} from '@elvorance/service-kit';
import { customer } from './customers.ts';
import { readConfiguration } from './configuration.ts';

export async function readDiscovery(tx: Transaction, principal: Principal, clientId: string) {
  requireRole(principal, 'rep', 'admin');
  await customer(tx, principal, clientId);
  return { record: (await tx.get<DiscoveryRecord>('discoveries', clientId)) ?? null };
}
function cleanAnswers(
  config: Configuration,
  activityId: string,
  input: unknown,
): Record<string, DiscoveryAnswer> {
  const raw = object(input);
  const questions = config.questions.filter(
    (q) => q.active !== false && q.activityIds.some((id) => id === '*' || id === activityId),
  );
  const allowed = new Map(questions.map((q) => [q.id, q]));
  const answers: Record<string, DiscoveryAnswer> = {};
  assert(Object.keys(raw).length <= 500, 'INVALID_ANSWERS', 'Too many answers');
  for (const [key, value] of Object.entries(raw)) {
    const other = key.endsWith('__other');
    const question = allowed.get(other ? key.slice(0, -7) : key);
    assert(
      question && !['__proto__', 'constructor', 'prototype'].includes(key),
      'INVALID_ANSWERS',
      'Answer does not belong to this activity',
    );
    if (other) {
      assert(question.otherAllowed, 'INVALID_ANSWERS', 'This question has no other-answer field');
      answers[key] = optionalText(value, key, 2000);
    } else if (question.type === 'multi') {
      const values = array(value, key, 60).map((entry) => text(entry, key, 1, 100));
      assert(
        new Set(values).size === values.length,
        'INVALID_ANSWERS',
        'Duplicate choices are not allowed',
      );
      answers[key] = values;
    } else if (question.type === 'number')
      answers[key] = finite(value, key, question.min ?? -1e12, question.max ?? 1e12);
    else answers[key] = optionalText(value, key, question.type === 'single' ? 100 : 2000);
  }
  return answers;
}
export async function saveDiscovery(
  tx: Transaction,
  principal: Principal,
  clientId: string,
  input: unknown,
): Promise<DiscoveryRecord> {
  requireRole(principal, 'rep', 'admin');
  const owner = await customer(tx, principal, clientId);
  assert(
    !owner.doNotContact,
    'DO_NOT_CONTACT',
    'Customer has opted out of new sales activity',
    409,
  );
  const body = object(input);
  const config = await readConfiguration(tx);
  assert(
    config.source === 'tenant',
    'CONFIGURATION_REQUIRED',
    'Publish the tenant questionnaire and catalog before capturing discovery',
    409,
  );
  const configurationRevision = integer(body.configurationRevision, 'configurationRevision', 1);
  assert(
    configurationRevision === config.definition.revision,
    'CONFIGURATION_CHANGED',
    'Reload the current questionnaire before saving answers',
    409,
  );
  const activityId = text(body.activityId, 'activityId', 2, 50);
  assert(
    config.definition.activities.some(
      (activity) => activity.id === activityId && activity.active !== false,
    ),
    'INVALID_ACTIVITY',
    'Choose an active configured activity',
  );
  const status = oneOf(body.status, ['draft', 'submitted'] as const, 'status');
  const answers = cleanAnswers(config.definition, activityId, body.answers);
  const definition =
    status === 'submitted'
      ? config.definition
      : {
          ...config.definition,
          questions: config.definition.questions.map((q) => ({ ...q, required: false })),
        };
  const errors = validateAnswers(definition, activityId, answers, config.catalog);
  assert(
    Object.keys(errors).length === 0,
    'DISCOVERY_VALIDATION',
    Object.entries(errors)
      .map(([key, error]) => `${key}: ${error}`)
      .slice(0, 10)
      .join('; '),
  );
  const current = await tx.get<DiscoveryRecord>('discoveries', clientId);
  const expected = integer(body.expectedVersion, 'expectedVersion', 0);
  assert(
    (current?.version ?? 0) === expected,
    'VERSION_CONFLICT',
    'Discovery changed; reload before saving',
    409,
  );
  const content = {
    clientId,
    repId: owner.repId,
    configurationRevision,
    activityId,
    answers,
    status,
    notes: optionalText(body.notes, 'notes', 3000),
    savedBy: principal.sub,
  };
  const record = current
    ? await tx.replace<DiscoveryRecord>('discoveries', { ...current, ...content }, expected)
    : await tx.insert<DiscoveryRecord>('discoveries', { id: clientId, ...content });
  await tx.emit('crm.discovery_saved.v1', record.id, record.version, {
    clientId,
    repId: record.repId,
    status,
    configurationRevision,
  });
  return record;
}
export async function readCatalog(tx: Transaction) {
  const config = await readConfiguration(tx);
  return {
    items:
      config.source === 'tenant'
        ? config.catalog
            .filter((item) => item.active !== false)
            .map((item) => ({ ...item, unitPriceMinor: Math.round(item.price * 100) }))
        : [],
    configured: config.source === 'tenant',
    recordVersion: config.recordVersion,
    currency: config.currency,
  };
}
