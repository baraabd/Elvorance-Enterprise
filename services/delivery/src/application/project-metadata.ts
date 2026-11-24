import type { Principal } from '@elvorance/contracts';
import {
  assert,
  dateOnly,
  object,
  requireRole,
  text,
  version,
  type Transaction,
} from '@elvorance/service-kit';
import type { Project } from '../domain/model.ts';
import { project } from './projects.ts';
export async function updateProjectMetadata(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  milestoneId?: string,
): Promise<Project> {
  requireRole(principal, 'admin', 'delivery');
  const body = object(input);
  const allowed = milestoneId
    ? ['expectedVersion', 'title', 'dueOn']
    : ['expectedVersion', 'title'];
  assert(
    Object.keys(body).every((key) => allowed.includes(key)),
    'UNKNOWN_FIELD',
    'Only planning metadata may be changed',
  );
  assert(
    body.title !== undefined || (milestoneId && body.dueOn !== undefined),
    'EMPTY_PATCH',
    'Provide a metadata change',
  );
  const value = await project(tx, principal, id);
  assert(
    value.status !== 'completed',
    'PROJECT_COMPLETED',
    'Completed projects are immutable',
    409,
  );
  if (!milestoneId)
    return tx.replace<Project>(
      'projects',
      { ...value, title: text(body.title, 'title', 3, 300) },
      version(body),
    );
  const milestone = value.milestones.find((item) => item.id === milestoneId);
  assert(milestone, 'NOT_FOUND', 'Milestone was not found', 404);
  assert(
    milestone.status !== 'done',
    'MILESTONE_COMPLETED',
    'Completed milestone metadata is immutable',
    409,
  );
  const next = {
    ...milestone,
    title: body.title === undefined ? milestone.title : text(body.title, 'title', 3, 300),
    dueOn: body.dueOn === undefined ? milestone.dueOn : dateOnly(body.dueOn, 'dueOn'),
  };
  return tx.replace<Project>(
    'projects',
    {
      ...value,
      milestones: value.milestones.map((item) => (item.id === milestoneId ? next : item)),
    },
    version(body),
  );
}
