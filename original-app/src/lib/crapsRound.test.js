import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrapsRound, applyCrapsRoll, passLineResolution } from './crapsRound.js';

test('come-out point persists across nondecisive rolls then clears when made', () => {
  const begin = createCrapsRound('table-1');
  const point = applyCrapsRoll(begin, [4, 5]);
  assert.equal(point.point, 9);
  assert.equal(point.lastTotal, 9);
  assert.equal(point.lastEvent, 'point_established');
  const stillOn = applyCrapsRoll(point, [1, 3]);
  assert.equal(stillOn.point, 9);
  assert.equal(stillOn.lastTotal, 4);
  assert.equal(stillOn.lastEvent, 'no_decision');
  const made = applyCrapsRoll(stillOn, [3, 6]);
  assert.equal(made.phase, 'come_out');
  assert.equal(made.point, null);
  assert.equal(made.lastEvent, 'point_made');
  assert.equal(passLineResolution(made.lastEvent), 'win');
});
test('seven out clears established point and loses pass line', () => {
  const next = applyCrapsRoll(applyCrapsRoll(createCrapsRound(), [3, 3]), [3, 4]);
  assert.equal(next.lastEvent, 'seven_out');
  assert.equal(next.point, null);
  assert.equal(passLineResolution(next.lastEvent), 'lose');
});
test('come-out naturals and craps-out do not establish points', () => {
  assert.equal(applyCrapsRoll(createCrapsRound(), [5, 6]).lastEvent, 'natural');
  assert.equal(applyCrapsRoll(createCrapsRound(), [1, 1]).lastEvent, 'craps_out');
});
test('invalid dice and corrupt round are rejected', () => {
  for (const dice of [[0, 7], [1], [2.5, 4], [1, 2, 3], ['1', 4]])
    assert.throws(() => applyCrapsRoll(createCrapsRound(), dice), RangeError);
  assert.throws(() => applyCrapsRoll({ ...createCrapsRound(), phase: 'point', point: 7 }, [2, 2]), TypeError);
});
