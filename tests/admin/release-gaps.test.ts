import test from 'node:test';
import assert from 'node:assert/strict';
import { paths, type Row } from '../../apps/admin-web/src/server/api.ts';
import { parseRoute } from '../../apps/admin-web/src/server/workspace.ts';
import {
  createOperation,
  nestedProjectOperations,
  recordOperations,
} from '../../apps/admin-web/src/server/operations.ts';

const entity = (id: string, extra: Record<string, unknown> = {}): Row => ({
  id,
  tenantId: 'tenant-release',
  version: 3,
  createdAt: '2026-11-28T00:00:00.000Z',
  updatedAt: '2026-11-28T00:00:00.000Z',
  ...extra,
});

test('release gaps: Admin service requests resolve to the owning Sales API and real route', () => {
  assert.equal(Reflect.get(paths, 'service-requests'), '/v1/sales/service-requests');
  assert.equal(parseRoute('#/admin/service-requests/request-1').screen, 'service-requests');
  assert.equal(parseRoute('#/admin/service-requests/request-1').id, 'request-1');
});

test('release gaps: region metadata edits retain versioning and do not transfer assignments', () => {
  const operation = recordOperations('regions', entity('region-1', { active: true }))[0];
  assert.ok(operation);
  assert.equal(operation.method, 'PATCH');
  assert.equal(operation.path, '/v1/crm/regions/region-1');
  assert.equal(operation.versioned, true);
  assert.deepEqual(
    operation.fields.map((field) => field.key),
    ['name', 'code', 'active'],
  );
});

test('release gaps: project title can be edited without editing its immutable commercial snapshot', () => {
  const operation = recordOperations('projects', entity('project-1', { status: 'active' })).find(
    (item) => item.method === 'PATCH',
  );
  assert.ok(operation);
  assert.equal(operation.path, '/v1/delivery/projects/project-1');
  assert.equal(operation.versioned, true);
  assert.deepEqual(
    operation.fields.map((field) => field.key),
    ['title'],
  );
  assert.deepEqual(recordOperations('projects', entity('project-1', { status: 'completed' })), []);
  assert.equal(createOperation('projects'), null);
});

test('release gaps: editable milestone metadata uses milestone values, not the project title', () => {
  const project = entity('project-1', {
    title: 'Project title must not be copied to the milestone',
    status: 'active',
    milestones: [
      { id: 'm1', title: 'Milestone title', dueOn: '2027-01-03', status: 'pending' },
      { id: 'm2', title: 'Finished milestone', dueOn: null, status: 'done' },
    ],
  });
  const updates = nestedProjectOperations(project).filter((item) => item.method === 'PATCH');
  assert.equal(updates.length, 1);
  const operation = updates[0];
  assert.ok(operation?.prepare);
  assert.equal(operation.path, '/v1/delivery/projects/project-1/milestones/m1');
  assert.equal(operation.versioned, true);
  assert.deepEqual(
    operation.fields.map((field) => field.default),
    ['Milestone title', '2027-01-03'],
  );
  assert.deepEqual(operation.prepare({ milestoneTitle: 'Revised title', milestoneDueOn: null }), {
    title: 'Revised title',
    dueOn: null,
  });
  assert.deepEqual(nestedProjectOperations({ ...project, status: 'completed' }), []);
});
