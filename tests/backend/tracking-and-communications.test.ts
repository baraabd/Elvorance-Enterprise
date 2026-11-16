import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRepository, newId } from '@elvorance/service-kit';
import { createApp as trackingApp } from '../../services/tracking/src/app.ts';
import { createApp as communicationsApp } from '../../services/communications/src/app.ts';
import { auth, call } from './helpers.ts';

test('tracking requires explicit consent, monotonic fresh GPS, isolated owner and clears coordinates on stop', async (t) => {
  const repository = new MemoryRepository('tracking', ['tracking_sessions']);
  const app = trackingApp({ repository, auth });
  t.after(() => app.close());
  const deviceId = newId();
  assert.equal(
    (
      await call(app, 'POST', '/v1/sessions', 'rep', {
        deviceId,
        repName: 'QA representative',
        consent: false,
      })
    ).status,
    400,
  );
  let session = (
    await call(app, 'POST', '/v1/sessions', 'rep', {
      deviceId,
      repName: 'QA representative',
      consent: true,
      repId: 'rep-b',
    })
  ).body;
  assert.equal(session.repId, 'rep-a');
  assert.equal(session.latest, null);
  assert.equal(
    (
      await call(app, 'POST', '/v1/sessions', 'rep', {
        deviceId: newId(),
        repName: 'Second device',
        consent: true,
      })
    ).status,
    409,
  );
  assert.equal((await call(app, 'GET', `/v1/sessions/${session.id}`, 'otherRep')).status, 404);
  assert.equal((await call(app, 'GET', '/v1/latest', 'client')).status, 403);
  let capturedAt = new Date().toISOString();
  const point = {
    expectedVersion: session.version,
    deviceId,
    sequence: 1,
    latitude: 0,
    longitude: 0,
    accuracy: 5,
    capturedAt,
  };
  assert.equal(
    (
      await call(app, 'POST', `/v1/sessions/${session.id}/points`, 'rep', {
        ...point,
        deviceId: newId(),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(app, 'POST', `/v1/sessions/${session.id}/points`, 'rep', {
        ...point,
        capturedAt: new Date(Date.now() - 60000).toISOString(),
      })
    ).status,
    409,
  );
  const accepted = await call(
    app,
    'POST',
    `/v1/sessions/${session.id}/points`,
    'rep',
    point,
    'gps-sequence-one',
  );
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.latest, undefined);
  assert.equal(
    (await call(app, 'POST', `/v1/sessions/${session.id}/points`, 'rep', point, 'gps-sequence-one'))
      .body.acceptedSequence,
    1,
  );
  session = (await call(app, 'GET', `/v1/sessions/${session.id}`, 'rep')).body;
  assert.equal(session.freshness, 'live');
  assert.equal(session.latest.latitude, 0);
  assert.equal(
    (
      await call(app, 'POST', `/v1/sessions/${session.id}/points`, 'rep', {
        ...point,
        expectedVersion: session.version,
      })
    ).status,
    409,
  );
  const paused = (
    await call(app, 'POST', `/v1/sessions/${session.id}/state`, 'rep', {
      expectedVersion: session.version,
      deviceId,
      state: 'paused',
    })
  ).body;
  const resumed = (
    await call(app, 'POST', `/v1/sessions/${session.id}/state`, 'rep', {
      expectedVersion: paused.version,
      deviceId,
      state: 'active',
    })
  ).body;
  session = (await call(app, 'GET', `/v1/sessions/${session.id}`, 'rep')).body;
  assert.equal(session.freshness, 'waiting');
  assert.equal(session.latest, null);
  capturedAt = new Date(Date.now() + 1).toISOString();
  await call(app, 'POST', `/v1/sessions/${session.id}/points`, 'rep', {
    ...point,
    expectedVersion: resumed.version,
    sequence: 2,
    latitude: 0.0001,
    longitude: 0.0001,
    capturedAt,
  });
  session = (await call(app, 'GET', `/v1/sessions/${session.id}`, 'rep')).body;
  const stopped = await call(app, 'POST', `/v1/sessions/${session.id}/state`, 'admin', {
    expectedVersion: session.version,
    state: 'stopped',
  });
  assert.equal(stopped.status, 200);
  session = (await call(app, 'GET', `/v1/sessions/${session.id}`, 'rep')).body;
  assert.equal(session.latest, null);
  assert.equal(session.freshness, 'stopped');
  assert.equal(
    (
      await call(app, 'POST', `/v1/sessions/${session.id}/points`, 'rep', {
        ...point,
        expectedVersion: session.version,
        sequence: 3,
        capturedAt: new Date().toISOString(),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(app, 'POST', '/v1/sessions', 'rep', {
        deviceId: newId(),
        repName: 'New authorized device',
        consent: true,
      })
    ).status,
    200,
  );
  assert.equal(
    repository.events().length,
    0,
    'No coordinate history is emitted into the event bus',
  );
});

test('support tickets are tenant and customer scoped; resolve/reopen/reply actions preserve version and history', async (t) => {
  const repository = new MemoryRepository('communications', ['tickets', 'notifications']);
  const app = communicationsApp({ repository, auth });
  t.after(() => app.close());
  let ticket = (
    await call(app, 'POST', '/v1/tickets', 'client', {
      subject: 'Project clarification',
      category: 'delivery',
      message: 'Please clarify the delivery review schedule',
      clientId: 'client-b',
    })
  ).body;
  assert.equal(ticket.clientId, 'client-a');
  assert.equal((await call(app, 'GET', `/v1/tickets/${ticket.id}`, 'otherClient')).status, 404);
  assert.equal((await call(app, 'GET', `/v1/tickets/${ticket.id}`, 'outsider')).status, 404);
  ticket = (
    await call(app, 'POST', `/v1/tickets/${ticket.id}/replies`, 'support', {
      expectedVersion: ticket.version,
      message: 'We will review the plan with the delivery team.',
    })
  ).body;
  assert.equal(ticket.messages.length, 2);
  assert.equal(ticket.messages[1].senderRole, 'support');
  const previousVersion = ticket.version;
  ticket = (
    await call(app, 'POST', `/v1/tickets/${ticket.id}/status`, 'support', {
      expectedVersion: ticket.version,
      status: 'resolved',
    })
  ).body;
  assert.equal(
    (
      await call(app, 'POST', `/v1/tickets/${ticket.id}/replies`, 'client', {
        expectedVersion: ticket.version,
        message: 'Another question',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(app, 'POST', `/v1/tickets/${ticket.id}/status`, 'client', {
        expectedVersion: previousVersion,
        status: 'open',
      })
    ).status,
    409,
  );
  ticket = (
    await call(app, 'POST', `/v1/tickets/${ticket.id}/status`, 'client', {
      expectedVersion: ticket.version,
      status: 'open',
    })
  ).body;
  ticket = (
    await call(app, 'POST', `/v1/tickets/${ticket.id}/replies`, 'client', {
      expectedVersion: ticket.version,
      message: 'The updated schedule is understood.',
    })
  ).body;
  assert.equal(ticket.messages.length, 3);
  assert.equal(ticket.status, 'open');
  assert.equal(repository.events()[0]!.type, 'communications.ticket_opened.v1');
});
