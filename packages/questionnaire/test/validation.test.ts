import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultCatalog,
  defaultConfiguration,
  recommendServices,
  validateAnswers,
  validateConfiguration,
  type Configuration,
  type Question,
} from '../src/index.ts';

function question(): Question {
  const value = defaultConfiguration().questions[0];
  assert(value);
  return value;
}

function withQuestion(fields: Record<string, unknown>): unknown {
  return { ...defaultConfiguration(), questions: [{ ...question(), ...fields }] };
}

function invalid(value: unknown, catalog: unknown = []): void {
  const errors = validateConfiguration(value, catalog);
  assert(errors.length > 0, 'Malformed input must report validation errors');
  assert(errors.every((error) => typeof error === 'string' && error.length > 0));
}

test('configuration validation rejects primitive values and malformed collection shapes', () => {
  for (const value of [null, undefined, false, 0, 'configuration', [], Symbol('invalid')])
    invalid(value);
  for (const value of [null, undefined, false, 1, 'collection', {}, []]) {
    invalid({ ...defaultConfiguration(), activities: value });
    invalid({ ...defaultConfiguration(), questions: value });
  }
});

test('null, primitive and sparse activity/question entries return errors instead of throwing', () => {
  for (const value of [null, undefined, false, 1, 'entry', []]) {
    invalid({ ...defaultConfiguration(), activities: [value] });
    invalid({ ...defaultConfiguration(), questions: [value] });
  }
  invalid({ ...defaultConfiguration(), activities: new Array<unknown>(1) });
  invalid({ ...defaultConfiguration(), questions: new Array<unknown>(1) });
});

test('malformed options are rejected for choice, text, number and catalog-backed questions', () => {
  for (const type of ['single', 'multi', 'text', 'number']) {
    for (const options of [null, undefined, {}, [null], [false], ['option'], [[]], new Array(1)])
      invalid(withQuestion({ type, options }));
  }
  invalid(withQuestion({ id: 'solutions', type: 'multi', options: [null] }));
  assert.deepEqual(
    validateConfiguration(withQuestion({ id: 'solutions', type: 'multi', options: [] })),
    [],
  );
});

test('identifier and enum validation never accepts prototype properties or coerces objects', () => {
  const uncoercible = {
    toString() {
      throw new Error('No input coercion is permitted');
    },
  };
  for (const id of [null, 123, uncoercible, '__proto__', 'prototype', 'constructor']) {
    invalid(withQuestion({ id }));
    invalid(withQuestion({ options: [{ id, label: 'Option' }] }));
    invalid({ ...defaultConfiguration(), activities: [{ id, label: 'Activity', active: true }] });
  }
  for (const name of ['constructor', 'toString', '__proto__', uncoercible]) {
    invalid(withQuestion({ section: name }));
    invalid(withQuestion({ type: name }));
  }
});

test('question fields cannot carry malformed flags, ordering, scopes or numeric bounds', () => {
  for (const fields of [
    { active: 'false' },
    { required: null },
    { otherAllowed: 'true' },
    { order: '1' },
    { order: Infinity },
    { activityIds: [null] },
    { activityIds: ['unconfigured'] },
    { activityIds: new Array(1) },
    { type: 'number', min: 10, max: 2 },
    { type: 'number', min: '0' },
    { type: 'number', max: Infinity },
    { type: 'text', options: [null] },
  ])
    invalid(withQuestion(fields));
});

test('configuration metadata is validated before CRM can persist it', () => {
  for (const fields of [
    { schemaVersion: 0 },
    { schemaVersion: '1' },
    { revision: -1 },
    { revision: 1.5 },
    { revision: NaN },
    { updatedAt: 'not-a-date' },
    { updatedAt: {} },
  ])
    invalid({ ...defaultConfiguration(), ...fields });
});

test('catalog validation rejects malformed entries, duplicate IDs, metadata and prices', () => {
  const config = defaultConfiguration();
  for (const catalog of [null, false, 'catalog', {}, [null], [true], [[]], new Array(1)])
    invalid(config, catalog);
  const service = defaultCatalog()[0];
  assert(service);
  invalid(config, [service, service]);
  for (const fields of [
    { price: '450' },
    { price: NaN },
    { price: Infinity },
    { active: 'false' },
    { recommendationTags: [null] },
    { features: new Array(1) },
    { deliverables: 'list' },
    { category: {} },
    { short: {} },
  ])
    invalid(config, [{ ...service, ...fields }]);
});

test('public defaults are isolated between consumers and retain all catalog data', () => {
  const first = defaultConfiguration();
  const second = defaultConfiguration();
  const firstQuestion = first.questions[0];
  assert(firstQuestion);
  firstQuestion.label = 'Changed question for one consumer';
  firstQuestion.options.length = 0;
  assert.notEqual(second.questions[0]?.label, firstQuestion.label);
  assert((second.questions[0]?.options.length ?? 0) > 0);
  const firstCatalog = defaultCatalog();
  const secondCatalog = defaultCatalog();
  const firstService = firstCatalog[0];
  assert(firstService);
  firstService.recommendationTags?.push('private-copy');
  assert(!secondCatalog[0]?.recommendationTags?.includes('private-copy'));
  assert.deepEqual(validateConfiguration(second, secondCatalog), []);
});

test('numeric answers reject objects, booleans, symbols and arrays without coercion', () => {
  const config: Configuration = {
    ...defaultConfiguration(),
    questions: [{ ...question(), id: 'budget', type: 'number', min: 0, max: 1000, options: [] }],
  };
  for (const value of [false, {}, Symbol('bad'), [10], Infinity, ' ', 'invalid', -1, 1001])
    assert(validateAnswers(config, 'clinic', { budget: value }).budget);
  for (const value of [0, '0', '1000', 1000])
    assert.deepEqual(validateAnswers(config, 'clinic', { budget: value }), {});
});

test('other explanations require text and inherited answers do not satisfy required questions', () => {
  const config = { ...defaultConfiguration(), questions: [question()] };
  const id = question().id;
  for (const explanation of [123, {}, ['long-enough'], 'ab', 'x'.repeat(2001)])
    assert(validateAnswers(config, 'clinic', { [id]: 'other', [`${id}__other`]: explanation })[id]);
  const inherited: Record<string, unknown> = Object.create({ [id]: 'lost' });
  assert(validateAnswers(config, 'clinic', inherited)[id]);
});

test('recommendations preserve the existing ranking, reasons and extended catalog fields', () => {
  const catalog = defaultCatalog().map((service) => ({ ...service, customField: 'retained' }));
  const result = recommendServices(
    defaultConfiguration(),
    'clinic',
    { need: 'social new_clients' },
    catalog,
  );
  const social = result.find((service) => service.id === 'svc-social');
  assert(social);
  assert.equal(social.score, 10);
  assert.equal(social.customField, 'retained');
  assert.equal(social.reasons.length, 2);
  assert.equal(result[0]?.id, social.id);
  assert.deepEqual(
    recommendServices(
      defaultConfiguration(),
      'clinic',
      {
        need: {
          toString() {
            throw new Error('unsafe');
          },
        },
      },
      catalog,
    ),
    [],
  );
});
