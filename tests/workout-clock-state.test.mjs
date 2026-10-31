import test from 'node:test';
import assert from 'node:assert/strict';
import { createRestTimerState, formatWorkoutClock, parseRestTimerState, pauseRestTimer, restTimerRemaining, restTimerStorageKey, settleRestTimer, startRestTimer, workoutElapsedSeconds } from '../lib/workout-clock-state.ts';

const now = 1_800_000_000_000;

test('workout elapsed time accounts for time outside the page and formats hours', () => {
  assert.equal(workoutElapsedSeconds(now - 3_661_800, now), 3661);
  assert.equal(formatWorkoutClock(3661), '01:01:01');
  assert.equal(formatWorkoutClock(3599), '59:59');
  assert.equal(formatWorkoutClock(60), '01:00');
  assert.equal(formatWorkoutClock(0), '00:00');
  assert.equal(formatWorkoutClock(-5), '00:00');
  assert.equal(formatWorkoutClock(Infinity), '00:00');
  assert.equal(workoutElapsedSeconds(now + 1000, now), 0);
});

test('rest uses an absolute deadline after closing and reopening the page', () => {
  const running = startRestTimer(createRestTimerState(90), now);
  const restored = parseRestTimerState(JSON.stringify(running), now + 31_500);
  assert.deepEqual(restored, running);
  assert.equal(restTimerRemaining(restored, now + 31_500), 59);
  assert.deepEqual(settleRestTimer(restored, now + 91_000), { version: 1, duration: 90, remaining: 0, deadline: null });
  const completed = settleRestTimer(restored, now + 91_000);
  assert.deepEqual(parseRestTimerState(JSON.stringify(completed), now + 200_000), completed);
});

test('pause captures the deadline instead of a stale displayed remaining value', () => {
  const running = startRestTimer(createRestTimerState(60), now);
  const paused = pauseRestTimer(running, now + 12_100);
  assert.deepEqual(paused, { version: 1, duration: 60, remaining: 48, deadline: null });
  const restored = parseRestTimerState(JSON.stringify(paused), now + 500_000);
  assert.equal(restTimerRemaining(restored, now + 500_000), 48);
  assert.equal(startRestTimer(restored, now + 500_000).deadline, now + 548_000);
  assert.equal(pauseRestTimer(running, now + 60_500).remaining, 0);
});

test('a completed rest stays completed until explicitly started or reset', () => {
  const completed = settleRestTimer(startRestTimer(createRestTimerState(30), now), now + 30_000);
  assert.equal(restTimerRemaining(completed, now + 900_000), 0);
  assert.equal(startRestTimer(completed, now + 900_000).deadline, now + 930_000);
  assert.deepEqual(createRestTimerState(completed.duration), { version: 1, duration: 30, remaining: 30, deadline: null });
});

test('invalid or unsupported saved rest data is discarded', () => {
  const state = createRestTimerState();
  for (const value of [null, '', '{', '[]', 'null', '"text"', 'x'.repeat(1001)]) {
    assert.equal(parseRestTimerState(value, now), null);
  }
  for (const patch of [
    { version: 2 }, { duration: 47 }, { duration: '60' },
    { remaining: -1 }, { remaining: 61 }, { remaining: 2.5 }, { remaining: '40' },
    { deadline: 0 }, { deadline: '1800000000000' }, { deadline: now + 100_000 },
    { deadline: Number.MAX_SAFE_INTEGER + 1 }, { deadline: now + 1000, remaining: 0 },
  ]) {
    assert.equal(parseRestTimerState(JSON.stringify({ ...state, ...patch }), now), null, JSON.stringify(patch));
  }
  assert.deepEqual(createRestTimerState(47), state);
});

test('rest storage is isolated by user and stable workout session', () => {
  assert.notEqual(restTimerStorageKey('user-a', 'session'), restTimerStorageKey('user-b', 'session'));
  assert.notEqual(restTimerStorageKey('user-a', 'session'), restTimerStorageKey('user-a', 'session-2'));
  assert.notEqual(restTimerStorageKey('user:a', 'session'), restTimerStorageKey('user', 'a:session'));
});
