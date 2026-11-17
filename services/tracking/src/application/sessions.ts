import type { Principal } from '@elvorance/contracts';
import {
  assert,
  finite,
  integer,
  instant,
  notFound,
  now,
  object,
  oneOf,
  requireOwner,
  requireRole,
  text,
  version,
  type Transaction,
} from '@elvorance/service-kit';
import type { TrackingSession } from '../domain/model.ts';
export async function createSession(
  tx: Transaction,
  principal: Principal,
  input: unknown,
): Promise<TrackingSession> {
  requireRole(principal, 'rep');
  const body = object(input);
  assert(
    body.consent === true,
    'CONSENT_REQUIRED',
    'Explicit consent is required before location collection',
  );
  const sessions = await tx.list<TrackingSession>('tracking_sessions', { repId: principal.repId! });
  assert(
    !sessions.some((value) => value.status !== 'stopped'),
    'ACTIVE_SESSION_EXISTS',
    'Stop the previous device session before starting a new one',
    409,
  );
  return tx.insert<TrackingSession>('tracking_sessions', {
    repId: principal.repId!,
    repName: text(body.repName, 'repName', 2, 150),
    deviceId: text(body.deviceId, 'deviceId', 16, 150),
    subject: principal.sub,
    status: 'active',
    consentAt: now(),
    stoppedAt: null,
    sequence: 0,
    latest: null,
  });
}
export async function getSession(
  tx: Transaction,
  principal: Principal,
  id: string,
): Promise<TrackingSession> {
  const value =
    (await tx.get<TrackingSession>('tracking_sessions', id)) ?? notFound('Tracking session');
  requireOwner(principal, { repId: value.repId });
  return value;
}
export async function recordPoint(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
): Promise<{ sessionId: string; version: number; status: string; acceptedSequence: number }> {
  requireRole(principal, 'rep');
  const body = object(input);
  const value = await getSession(tx, principal, id);
  assert(
    value.repId === principal.repId && value.subject === principal.sub,
    'NOT_FOUND',
    'Tracking session was not found',
    404,
  );
  assert(
    value.status === 'active',
    'TRACKING_PAUSED',
    'Resume an active consented session before sending a point',
    409,
  );
  assert(
    body.deviceId === value.deviceId,
    'DEVICE_MISMATCH',
    'This session belongs to another device',
    403,
  );
  const sequence = integer(body.sequence, 'sequence', 1);
  const capturedAt = instant(body.capturedAt, 'capturedAt');
  const age = Date.now() - Date.parse(capturedAt);
  assert(sequence > value.sequence, 'OLD_SEQUENCE', 'Point sequence must increase', 409);
  assert(
    age >= -10_000 && age <= 30_000,
    'STALE_POINT',
    'Location must come from a fresh GPS reading',
    409,
  );
  assert(
    !value.latest || Date.parse(capturedAt) > Date.parse(value.latest.capturedAt),
    'OLD_POINT',
    'The reading is older than the last accepted point',
    409,
  );
  const latest = {
    latitude: finite(body.latitude, 'latitude', -90, 90),
    longitude: finite(body.longitude, 'longitude', -180, 180),
    accuracy: finite(body.accuracy, 'accuracy', 0, 100_000),
    capturedAt,
    receivedAt: now(),
    sequence,
  };
  const updated = await tx.replace<TrackingSession>(
    'tracking_sessions',
    { ...value, sequence, latest },
    version(body),
  );
  // Do not persist coordinates in idempotency responses or event payloads: only the current row stores the latest point.
  return {
    sessionId: updated.id,
    version: updated.version,
    status: updated.status,
    acceptedSequence: updated.sequence,
  };
}
export async function changeState(
  tx: Transaction,
  principal: Principal,
  id: string,
  input: unknown,
): Promise<{ sessionId: string; version: number; status: string }> {
  requireRole(principal, 'rep', 'admin');
  const body = object(input);
  const value = await getSession(tx, principal, id);
  const state = oneOf(body.state, ['active', 'paused', 'stopped'] as const, 'state');
  if (principal.roles.includes('admin') && value.repId !== principal.repId)
    assert(
      state === 'stopped',
      'FORBIDDEN',
      'Administrators can stop a session but cannot grant representative consent',
      403,
    );
  else
    assert(
      body.deviceId === value.deviceId && principal.sub === value.subject,
      'DEVICE_MISMATCH',
      'This session belongs to another device',
      403,
    );
  assert(
    value.status !== 'stopped',
    'SESSION_STOPPED',
    'A stopped session requires new explicit consent',
    409,
  );
  assert(state !== value.status, 'SESSION_STATE', 'Session is already in the requested state', 409);
  const result = await tx.replace<TrackingSession>(
    'tracking_sessions',
    { ...value, status: state, latest: null, stoppedAt: state === 'stopped' ? now() : null },
    version(body),
  );
  return { sessionId: result.id, version: result.version, status: result.status };
}
