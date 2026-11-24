import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dailyAgenda,
  dayInZone,
  shiftDay,
  validDay,
} from '../../apps/rep-mobile/src/server/views/schedule-model.ts';
import { locationPermissionMode } from '../../packages/mobile-platform/src/location-permission.ts';

test('workday validation rejects normalized overflow and accepts leap days', () => {
  for (const value of ['', '2026-2-01', '2026-02-29', '2026-04-31', '2026-01-01T00:00:00Z'])
    assert.equal(validDay(value), false, value);
  assert.equal(validDay('2028-02-29'), true);
  assert.throws(() => shiftDay('2026-02-30', 1));
  assert.throws(() => shiftDay('2026-11-23', 1.5));
});

test('workday navigation crosses DST and month boundaries without skipping a calendar day', () => {
  assert.equal(shiftDay('2026-03-28', 1), '2026-03-29');
  assert.equal(shiftDay('2026-03-29', 1), '2026-03-30');
  assert.equal(shiftDay('2026-10-25', -1), '2026-10-24');
  assert.equal(shiftDay('2028-03-01', -1), '2028-02-29');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
});

test('visit instants use the declared local timezone rather than their UTC date', () => {
  assert.equal(dayInZone('2026-11-22T23:30:00Z', 'Europe/Stockholm'), '2026-11-23');
  assert.equal(dayInZone('2026-11-23T01:30:00Z', 'America/Los_Angeles'), '2026-11-22');
  assert.equal(dayInZone('2026-03-29T22:30:00Z', 'Europe/Stockholm'), '2026-03-30');
  assert.equal(dayInZone('invalid', 'Europe/Stockholm'), '');
  assert.equal(dayInZone(null, 'Europe/Stockholm'), '');
});

test('daily agenda sorts visits, keeps dueOn calendar dates and does not mutate API snapshots', () => {
  const visits = [
    { id: 'later', version: 1, scheduledAt: '2026-11-23T12:00:00Z' },
    { id: 'next', version: 1, scheduledAt: '2026-11-23T23:30:00Z' },
    { id: 'early', version: 1, scheduledAt: '2026-11-22T23:30:00Z' },
  ];
  const tasks = [
    { id: 'due', version: 1, dueOn: '2026-11-23' },
    { id: 'tomorrow', version: 1, dueOn: '2026-11-24' },
  ];
  const before = structuredClone(visits);
  const agenda = dailyAgenda(visits, tasks, '2026-11-23', 'Europe/Stockholm');
  assert.deepEqual(
    agenda.visits.map((row) => row.id),
    ['early', 'later'],
  );
  assert.deepEqual(
    agenda.tasks.map((row) => row.id),
    ['due'],
  );
  assert.deepEqual(visits, before);
  assert.throws(() => dailyAgenda(visits, tasks, 'invalid', 'Europe/Stockholm'));
});

test('foreground location respects precise, approximate, denied and unresolved platform decisions', () => {
  assert.equal(locationPermissionMode({ location: 'granted' }, true), 'precise');
  assert.equal(
    locationPermissionMode({ location: 'denied', coarseLocation: 'granted' }, true),
    'approximate',
  );
  assert.equal(
    locationPermissionMode({ location: 'prompt', coarseLocation: 'granted' }, true),
    'approximate',
  );
  assert.equal(
    locationPermissionMode({ location: 'denied', coarseLocation: 'denied' }, true),
    'denied',
  );
  assert.equal(locationPermissionMode({ location: 'prompt' }, true), 'denied');
  assert.equal(locationPermissionMode({ location: 'prompt-with-rationale' }, true), 'denied');
  assert.equal(locationPermissionMode({ location: 'prompt' }, false), 'browser-prompt');
  assert.equal(locationPermissionMode({ location: 'denied' }, false), 'denied');
  assert.equal(locationPermissionMode({ location: 'unexpected' }, true), 'denied');
});
