import type { CustomerDirectory, Opportunity, Principal } from '@elvorance/contracts';
import {
  assert,
  dateOnly,
  integer,
  object,
  oneOf,
  optionalText,
  text,
  version,
  type Transaction,
} from '@elvorance/service-kit';
import type { Contract } from '../domain/model.ts';
import { currentCustomer, ownedRecord } from './assignment.ts';

async function opportunityFields(
  tx: Transaction,
  input: unknown,
  clientId: string,
  repId: string,
  current?: Opportunity,
) {
  const body = object(input);
  const stage = oneOf(
    body.stage ?? current?.stage ?? 'new',
    ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const,
    'stage',
  );
  const contractId =
    body.contractId === undefined
      ? (current?.contractId ?? null)
      : body.contractId
        ? text(body.contractId, 'contractId', 1, 100)
        : null;
  let valueMinor = integer(
    body.valueMinor ?? current?.valueMinor ?? 0,
    'valueMinor',
    0,
    100_000_000_000,
  );
  let currency = text(body.currency ?? current?.currency ?? 'SAR', 'currency', 3, 3).toUpperCase();
  assert(/^[A-Z]{3}$/.test(currency), 'INVALID_CURRENCY', 'Currency must be a three-letter code');
  if (stage === 'won') {
    assert(
      contractId,
      'CONTRACT_REQUIRED',
      'A won opportunity requires an approved customer contract',
      409,
    );
    const contract = await tx.get<Contract>('contracts', contractId);
    assert(
      contract?.status === 'approved' && contract.clientId === clientId && contract.repId === repId,
      'CONTRACT_REQUIRED',
      'Only an approved contract for this customer can prove a won opportunity',
      409,
    );
    valueMinor = contract.totalMinor;
    currency = contract.currency;
  } else
    assert(!contractId, 'CONTRACT_STATE', 'A contract can only be linked to a won opportunity');
  if (current?.stage === 'won')
    assert(
      stage === 'won' && contractId === current.contractId,
      'IMMUTABLE_OPPORTUNITY',
      'A contracted opportunity cannot be reopened or reassigned',
      409,
    );
  return {
    title: text(body.title ?? current?.title, 'title', 3, 200),
    stage,
    valueMinor,
    currency,
    expectedCloseOn: dateOnly(
      body.expectedCloseOn === undefined ? current?.expectedCloseOn : body.expectedCloseOn,
      'expectedCloseOn',
    ),
    notes: optionalText(body.notes ?? current?.notes, 'notes', 3000),
    contractId,
  };
}
export async function createOpportunity(
  tx: Transaction,
  principal: Principal,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Opportunity> {
  const body = object(input);
  const customer = await currentCustomer(
    principal,
    text(body.clientId, 'clientId', 1, 100),
    directory,
    authorization,
    undefined,
    true,
  );
  return tx.insert<Opportunity>('opportunities', {
    clientId: customer.id,
    customerName: customer.name,
    repId: customer.repId,
    ...(await opportunityFields(tx, body, customer.id, customer.repId)),
  });
}
export async function updateOpportunity(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
  directory: CustomerDirectory,
  authorization: string,
): Promise<Opportunity> {
  const body = object(input);
  const current = await ownedRecord<Opportunity>(
    tx,
    'opportunities',
    id,
    principal,
    directory,
    authorization,
  );
  assert(
    body.repId === undefined && (body.clientId === undefined || body.clientId === current.clientId),
    'IMMUTABLE_ASSIGNMENT',
    'Opportunity assignment cannot be changed',
  );
  const fields = await opportunityFields(tx, body, current.clientId, current.repId, current);
  await currentCustomer(
    principal,
    current.clientId,
    directory,
    authorization,
    current.repId,
    !['lost', 'won'].includes(fields.stage),
  );
  const result = await tx.replace<Opportunity>(
    'opportunities',
    { ...current, ...fields },
    version(body),
  );
  await tx.emit('sales.opportunity_updated.v1', result.id, result.version, {
    opportunityId: result.id,
    clientId: result.clientId,
    repId: result.repId,
    stage: result.stage,
  });
  return result;
}
