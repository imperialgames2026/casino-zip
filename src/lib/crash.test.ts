import { describe, expect, it } from "vitest";
import { BETTING_MS, QUEUE_SIZE, CRASH_MAX, phaseAt, treballColor, treballReturn, displayedMultiplier } from "./crash";
describe("shared Crash/Treball rules", () => {
  it("keeps the requested queue, countdown and maximum", () => { expect(QUEUE_SIZE).toBe(150); expect(BETTING_MS).toBe(6000); expect(CRASH_MAX).toBe(12000); });
  it("assigns inclusive range boundaries", () => {
    expect(treballColor(0)).toBe("red"); expect(treballColor(1.99)).toBe("red");
    expect(treballColor(2)).toBe("green"); expect(treballColor(9.99)).toBe("green");
    expect(treballColor(10)).toBe("yellow"); expect(treballColor(12000)).toBe("yellow");
    expect(() => treballColor(12000.01)).toThrow();
  });
  it("pays only the winning color", () => {
    expect(treballReturn(1.5,"red",10)).toBe(19.7);
    expect(treballReturn(3,"green",10)).toBe(20);
    expect(treballReturn(15,"yellow",10)).toBe(100);
    expect(treballReturn(15,"red",10)).toBe(0);
  });
  it("supports variable duration and no post-crash live phase", () => {
    for (const duration of [500,10000,40000]) {
      expect(phaseAt(5999,6000,6000+duration)).toBe("betting");
      expect(phaseAt(6000,6000,6000+duration)).toBe("live");
      expect(phaseAt(6000+duration,6000,6000+duration)).toBe("crashed");
      expect(displayedMultiplier(duration,duration,12000)).toBe(12000);
    }
  });
});
