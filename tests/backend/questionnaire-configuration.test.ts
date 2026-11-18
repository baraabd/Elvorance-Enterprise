import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultCatalog, defaultConfiguration } from '@elvorance/questionnaire';
import { MemoryRepository } from '@elvorance/service-kit';
import { createApp } from '../../services/crm/src/app.ts';
import { tables } from '../../services/crm/src/infrastructure/migrations/001_initial.ts';
import { auth, call } from './helpers.ts';

test('CRM rejects malformed questionnaire entries with 400 and does not publish them', async (t) => {
  const app = createApp({ repository: new MemoryRepository('crm', tables), auth });
  t.after(() => app.close());
  const definition = defaultConfiguration();
  const first = definition.questions[0];
  assert(first);
  for (const questions of [
    [null],
    [false],
    [{ ...first, options: [null] }],
    [{ ...first, type: 'constructor' }],
  ]) {
    const response = await call(app, 'PUT', '/v1/configuration', 'admin', {
      expectedVersion: 0,
      definition: { ...definition, questions },
      catalog: defaultCatalog(),
    });
    assert.equal(response.status, 400, JSON.stringify(response.body));
    assert.equal(response.body.error.code, 'CONFIG_VALIDATION');
    const stored = await call(app, 'GET', '/v1/configuration', 'admin');
    assert.equal(stored.body.source, 'default');
    assert.equal(stored.body.recordVersion, 0);
  }
  const published = await call(app, 'PUT', '/v1/configuration', 'admin', {
    expectedVersion: 0,
    definition,
    catalog: defaultCatalog(),
  });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal(published.body.recordVersion, 1);
  assert.deepEqual(published.body.catalog, defaultCatalog());
});
