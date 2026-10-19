/** Shared Crash / Treball mechanics. Free-play only; not a settlement engine. */
export const CRASH_MAX = 12000;
export const BETTING_MS = 6000;
export const QUEUE_SIZE = 150;
export type TreballColor = "red" | "green" | "yellow";
export function treballColor(point: number): TreballColor {
  if (!Number.isFinite(point) || point < 0 || point > CRASH_MAX) throw new RangeError("Invalid crash point");
  return point < 2 ? "red" : point < 10 ? "green" : "yellow";
}
export const TREBALL_PAYOUT = { red: 1.97, green: 2, yellow: 10 } as const;
export function treballReturn(point: number, color: TreballColor, stake: number): number {
  if (!Number.isFinite(stake) || stake < 0) throw new RangeError("Invalid stake");
  return treballColor(point) === color ? Math.round(stake * TREBALL_PAYOUT[color] * 100) / 100 : 0;
}
/** A display-only multiplier curve; real crash/cashout must be timed on the server. */
export function displayedMultiplier(elapsedMs: number, durationMs: number, crashPoint: number): number {
  if (!(durationMs > 0) || !(elapsedMs >= 0) || !Number.isFinite(crashPoint) || crashPoint < 0 || crashPoint > CRASH_MAX) throw new RangeError("Invalid round");
  const progress = Math.min(1, elapsedMs / durationMs);
  return Math.round(crashPoint * progress * progress * 100) / 100;
}
export function phaseAt(now: number, bettingEndsAt: number, crashesAt: number): "betting" | "live" | "crashed" {
  if (!(crashesAt > bettingEndsAt)) throw new RangeError("Invalid timeline");
  return now < bettingEndsAt ? "betting" : now < crashesAt ? "live" : "crashed";
}
