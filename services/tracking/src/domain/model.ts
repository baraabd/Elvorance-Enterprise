import type { Entity } from '@elvorance/contracts';
export interface LatestPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  receivedAt: string;
  sequence: number;
}
export interface TrackingSession extends Entity {
  repId: string;
  repName: string;
  deviceId: string;
  subject: string;
  status: 'active' | 'paused' | 'stopped';
  consentAt: string;
  stoppedAt: string | null;
  sequence: number;
  latest: LatestPoint | null;
}
export function viewSession(session: TrackingSession, at = Date.now()) {
  const age = session.latest ? Math.max(0, at - Date.parse(session.latest.capturedAt)) : null;
  return {
    ...session,
    freshness:
      session.status === 'stopped'
        ? 'stopped'
        : session.status === 'paused'
          ? 'paused'
          : !session.latest
            ? 'waiting'
            : age! > 30_000
              ? 'stale'
              : 'live',
    ageMs: age,
    limitation:
      'Requires an open application and fresh device GPS; background collection is not promised',
  };
}
