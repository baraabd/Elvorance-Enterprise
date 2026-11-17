import type { Principal } from '@elvorance/contracts';
import {
  assert,
  dateOnly,
  newId,
  notFound,
  now,
  object,
  oneOf,
  optionalText,
  requireOwner,
  requireRole,
  text,
  version,
  type Transaction,
} from '@elvorance/service-kit';
import type { Deliverable, Project } from '../domain/model.ts';
export async function project(tx: Transaction, principal: Principal, id: string): Promise<Project> {
  const value = (await tx.get<Project>('projects', id)) ?? notFound('Project');
  requireOwner(principal, value, ['admin', 'delivery']);
  return value;
}
export async function addMilestone(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
): Promise<Project> {
  requireRole(principal, 'admin', 'delivery');
  const body = object(input);
  const value = await project(tx, principal, id);
  assert(
    value.status !== 'completed',
    'PROJECT_COMPLETED',
    'Completed project scope cannot be changed',
    409,
  );
  assert(
    value.milestones.length < 100,
    'MILESTONE_LIMIT',
    'Project has reached the milestone limit',
  );
  const milestone = {
    id: newId(),
    title: text(body.title, 'title', 3, 300),
    status: 'pending' as const,
    dueOn: dateOnly(body.dueOn, 'dueOn'),
    completedAt: null,
  };
  return tx.replace<Project>(
    'projects',
    { ...value, milestones: [...value.milestones, milestone] },
    version(body),
  );
}
export async function updateMilestone(
  tx: Transaction,
  principal: Principal,
  id: string,
  milestoneId: string,
  input: unknown,
): Promise<Project> {
  requireRole(principal, 'admin', 'delivery');
  const body = object(input);
  const value = await project(tx, principal, id);
  assert(
    value.status !== 'completed',
    'PROJECT_COMPLETED',
    'Completed project cannot be changed',
    409,
  );
  const index = value.milestones.findIndex((item) => item.id === milestoneId);
  assert(index >= 0, 'NOT_FOUND', 'Milestone was not found', 404);
  const milestone = value.milestones[index]!;
  const status = oneOf(body.status, ['in_progress', 'done'] as const, 'status');
  assert(
    (milestone.status === 'pending' && status === 'in_progress') ||
      (milestone.status === 'in_progress' && status === 'done'),
    'MILESTONE_STATE',
    'Milestones must progress from pending to in progress to done',
    409,
  );
  assert(
    value.milestones.slice(0, index).every((item) => item.status === 'done'),
    'MILESTONE_ORDER',
    'Finish preceding milestones first',
    409,
  );
  const milestones = value.milestones.map((item) =>
    item.id === milestoneId
      ? { ...item, status, completedAt: status === 'done' ? now() : null }
      : item,
  );
  // Progress is capped until explicit project completion and approval of real deliverables.
  const progress = Math.min(
    95,
    Math.round(
      (milestones.filter((item) => item.status === 'done').length / milestones.length) * 100,
    ),
  );
  return tx.replace<Project>(
    'projects',
    { ...value, status: 'active', startedAt: value.startedAt ?? now(), milestones, progress },
    version(body),
  );
}
function deliverableContent(body: Record<string, unknown>): {
  title: string;
  content: string;
  url: string | null;
} {
  const url = optionalText(body.url, 'url', 2000) || null;
  if (url) {
    let parsed: URL | undefined;
    try {
      parsed = new URL(url);
    } catch {
      /* validation below */
    }
    assert(
      parsed && parsed.protocol === 'https:' && !parsed.username && !parsed.password,
      'INVALID_URL',
      'Deliverable links must use HTTPS',
    );
  }
  return {
    title: text(body.title, 'title', 3, 300),
    content: text(body.content, 'content', 30, 20_000),
    url,
  };
}
export async function addDeliverable(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
): Promise<Project> {
  requireRole(principal, 'admin', 'delivery');
  const body = object(input);
  const value = await project(tx, principal, id);
  assert(
    value.status !== 'completed',
    'PROJECT_COMPLETED',
    'Completed project cannot accept a new deliverable',
    409,
  );
  const milestoneId = text(body.milestoneId, 'milestoneId', 1, 100);
  assert(
    value.milestones.some((item) => item.id === milestoneId),
    'NOT_FOUND',
    'Milestone was not found',
    404,
  );
  const deliverable: Deliverable = {
    id: newId(),
    ...deliverableContent(body),
    milestoneId,
    status: 'pending',
    revision: 1,
    submittedAt: now(),
    reviewedAt: null,
    feedback: '',
    history: [],
  };
  return tx.replace<Project>(
    'projects',
    { ...value, deliverables: [...value.deliverables, deliverable] },
    version(body),
  );
}
export async function reviseDeliverable(
  tx: Transaction,
  principal: Principal,
  id: string,
  deliverableId: string,
  input: unknown,
): Promise<Project> {
  requireRole(principal, 'admin', 'delivery');
  const body = object(input);
  const value = await project(tx, principal, id);
  const item =
    value.deliverables.find((deliverable) => deliverable.id === deliverableId) ??
    notFound('Deliverable');
  assert(
    value.status !== 'completed' && item.status === 'changes_requested',
    'DELIVERABLE_STATE',
    'Only a requested revision can be resubmitted',
    409,
  );
  const content = deliverableContent(body);
  assert(
    content.content !== item.content || content.url !== item.url,
    'UNCHANGED_REVISION',
    'A revision needs updated content or a new link',
  );
  const next: Deliverable = {
    ...item,
    ...content,
    status: 'pending',
    revision: item.revision + 1,
    submittedAt: now(),
    reviewedAt: null,
    feedback: '',
    history: [
      ...item.history,
      { content: item.content, url: item.url, revision: item.revision, feedback: item.feedback },
    ],
  };
  return tx.replace<Project>(
    'projects',
    {
      ...value,
      deliverables: value.deliverables.map((deliverable) =>
        deliverable.id === item.id ? next : deliverable,
      ),
    },
    version(body),
  );
}
export async function reviewDeliverable(
  tx: Transaction,
  principal: Principal,
  id: string,
  deliverableId: string,
  input: unknown,
): Promise<Project> {
  requireRole(principal, 'client');
  const body = object(input);
  const value = await project(tx, principal, id);
  assert(value.clientId === principal.clientId, 'NOT_FOUND', 'Project was not found', 404);
  const item =
    value.deliverables.find((deliverable) => deliverable.id === deliverableId) ??
    notFound('Deliverable');
  assert(
    item.status === 'pending' && value.status !== 'completed',
    'DELIVERABLE_STATE',
    'Only a pending deliverable can be reviewed',
    409,
  );
  assert(
    body.revision === item.revision,
    'REVISION_CONFLICT',
    'A newer deliverable revision is available',
    409,
  );
  const decision = oneOf(body.decision, ['approved', 'changes_requested'] as const, 'decision');
  const feedback =
    decision === 'changes_requested'
      ? text(body.feedback, 'feedback', 5, 3000)
      : optionalText(body.feedback, 'feedback', 3000);
  return tx.replace<Project>(
    'projects',
    {
      ...value,
      deliverables: value.deliverables.map((deliverable) =>
        deliverable.id === item.id
          ? { ...deliverable, status: decision, reviewedAt: now(), feedback }
          : deliverable,
      ),
    },
    version(body),
  );
}
export async function completeProject(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
): Promise<Project> {
  requireRole(principal, 'admin', 'delivery');
  const body = object(input);
  const value = await project(tx, principal, id);
  assert(
    value.status === 'active' &&
      value.milestones.length > 0 &&
      value.milestones.every((item) => item.status === 'done'),
    'INCOMPLETE_MILESTONES',
    'Every planned milestone must be completed',
    409,
  );
  assert(
    value.deliverables.length > 0 && value.deliverables.every((item) => item.status === 'approved'),
    'UNAPPROVED_DELIVERABLES',
    'Real deliverables require customer approval before completion',
    409,
  );
  const result = await tx.replace<Project>(
    'projects',
    { ...value, status: 'completed', progress: 100, completedAt: now() },
    version(body),
  );
  await tx.emit('delivery.project_completed.v1', result.id, result.version, {
    projectId: result.id,
    contractId: result.contractId,
    clientId: result.clientId,
    repId: result.repId,
  });
  return result;
}
