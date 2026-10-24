import test from 'node:test';
import assert from 'node:assert/strict';
import { compareLaps, driverLaps, lapTime } from '../frontend/analysis.js';

test('comparison uses matching lap numbers, not mismatched array positions', () => {
  const laps = [
    { driver_number: 1, lap_number: 1, lap_duration: 90 },
    { driver_number: 1, lap_number: 2, lap_duration: 91 },
    { driver_number: 1, lap_number: 3, lap_duration: 93 },
    { driver_number: 4, lap_number: 1, lap_duration: 91 },
    { driver_number: 4, lap_number: 3, lap_duration: 95 },
  ];
  const result = compareLaps(laps, 1, 4);
  assert.deepEqual(result.pairs.map(p=>p.lap), [1,3]);
  assert.equal(result.delta, -1.5);
});

test('missing times and pit-out laps never become zero-second laps', () => {
  const laps = [
    { driver_number: 1, lap_number: 1, lap_duration: null },
    { driver_number: 1, lap_number: 2, lap_duration: 110, is_pit_out_lap: true },
    { driver_number: 1, lap_number: 3, lap_duration: 90 },
    { driver_number: 1, lap_number: 4, lap_duration: 0 },
  ];
  assert.deepEqual(driverLaps(laps, '1').map(l=>l.lap_number), [3]);
  assert.equal(compareLaps(laps, 1, 4).delta, null);
});

test('lap time formatting carries rounded milliseconds into minutes', () => {
  assert.equal(lapTime(119.9999), '2:00.000');
  assert.equal(lapTime(90.123), '1:30.123');
  assert.equal(lapTime(null), '—');
});
