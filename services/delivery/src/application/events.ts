import type { ContractSnapshot, EventEnvelope } from '@elvorance/contracts';
import { array, assert, object, text, type Transaction } from '@elvorance/service-kit';
import type { Project } from '../domain/model.ts';
export const subscriptions = ['contract.approved.v1'];
export async function handleEvent(tx: Transaction, event: EventEnvelope): Promise<void> {
  if (event.type !== 'contract.approved.v1') return;
  const body = object(event.payload);
  const contractId = text(body.contractId, 'contractId', 1, 100);
  assert(event.aggregateId === contractId, 'EVENT_AGGREGATE', 'Contract event ID mismatch');
  if ((await tx.list<Project>('projects', { contractId })).length) return;
  const items = array(body.items, 'items', 40, 1);
  const snapshot = structuredClone(body) as unknown as ContractSnapshot;
  const project = await tx.insert<Project>('projects', {
    contractId,
    clientId: text(body.clientId, 'clientId', 1, 100),
    repId: text(body.repId, 'repId', 1, 100),
    title: items
      .map((item) => text(object(item).title, 'title', 2, 200))
      .join(' · ')
      .slice(0, 500),
    status: 'planning',
    progress: 0,
    contractSnapshot: snapshot,
    milestones: [],
    deliverables: [],
    startedAt: null,
    completedAt: null,
  });
  await tx.emit(
    'delivery.project_created.v1',
    project.id,
    project.version,
    {
      projectId: project.id,
      contractId,
      clientId: project.clientId,
      repId: project.repId,
      status: 'planning',
    },
    event.correlationId,
  );
}
