/**
 * Practice-only craps round state machine. This module does not accept wagers,
 * mutate wallets, roll random dice, or authorize multiplayer actions.
 * A future authoritative server must validate membership and dice outcomes.
 */
export const POINT_NUMBERS = Object.freeze([4, 5, 6, 8, 9, 10]);

export function createCrapsRound(tableId = 'practice') {
  if (typeof tableId !== 'string' || !tableId.trim()) throw new TypeError('tableId required');
  return Object.freeze({ tableId, phase: 'come_out', point: null, rollNumber: 0, lastRoll: null, lastTotal: null, lastEvent: 'new_round' });
}

export function applyCrapsRoll(round, dice) {
  if (!round || !['come_out', 'point'].includes(round.phase) || !Number.isSafeInteger(round.rollNumber) || round.rollNumber < 0)
    throw new TypeError('Invalid round state');
  if (round.phase === 'come_out' && round.point !== null) throw new TypeError('Come-out cannot have a point');
  if (round.phase === 'point' && !POINT_NUMBERS.includes(round.point)) throw new TypeError('Invalid point');
  if (!Array.isArray(dice) || dice.length !== 2 || !dice.every(v => Number.isInteger(v) && v >= 1 && v <= 6))
    throw new RangeError('Two dice with faces 1–6 required');
  const total = dice[0] + dice[1];
  let phase = round.phase, point = round.point, event = 'no_decision';
  if (phase === 'come_out') {
    if (total === 7 || total === 11) event = 'natural';
    else if ([2, 3, 12].includes(total)) event = 'craps_out';
    else { phase = 'point'; point = total; event = 'point_established'; }
  } else if (total === point) {
    phase = 'come_out'; point = null; event = 'point_made';
  } else if (total === 7) {
    phase = 'come_out'; point = null; event = 'seven_out';
  }
  return Object.freeze({ tableId: round.tableId, phase, point, rollNumber: round.rollNumber + 1, lastRoll: Object.freeze([...dice]), lastTotal: total, lastEvent: event });
}

export function passLineResolution(event) {
  if (event === 'natural' || event === 'point_made') return 'win';
  if (event === 'craps_out' || event === 'seven_out') return 'lose';
  return 'pending';
}
