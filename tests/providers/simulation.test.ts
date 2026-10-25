import { describe, expect, it } from "vitest";
import { delay, isScenarioName, simulatedLatencyMs } from "../../src/providers/simulation.ts";
import { activeTimers } from "../helpers.ts";

describe("simulatedLatencyMs", () => {
  it("is deterministic and stays inside the range", () => {
    for (let i = 0; i < 200; i++) {
      const seed = `seed-${i}`;
      const latency = simulatedLatencyMs(seed, 80, 200);
      expect(latency).toBeGreaterThanOrEqual(80);
      expect(latency).toBeLessThanOrEqual(200);
      expect(simulatedLatencyMs(seed, 80, 200)).toBe(latency);
    }
  });

  it("applies the latency multiplier", () => {
    const base = simulatedLatencyMs("x", 1000, 2000);
    expect(simulatedLatencyMs("x", 1000, 2000, 0.1)).toBe(Math.round(base * 0.1));
  });
});

describe("delay", () => {
  it("resolves after roughly the requested time without blocking the event loop", async () => {
    let ticked = false;
    setImmediate(() => (ticked = true));
    const startedAt = performance.now();
    await delay(30);
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(25);
    expect(ticked).toBe(true);
  });

  it("rejects with the abort reason and clears its timer", async () => {
    const baseline = activeTimers();
    const controller = new AbortController();
    const pending = delay(10_000, controller.signal);
    expect(activeTimers()).toBe(baseline + 1);

    const reason = new Error("stop");
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(activeTimers()).toBe(baseline);
  });

  it("rejects immediately for an already-aborted signal", async () => {
    await expect(delay(10_000, AbortSignal.abort(new Error("already")))).rejects.toThrow("already");
  });
});

describe("isScenarioName", () => {
  it("accepts known scenarios only", () => {
    expect(isScenarioName("slow-provider")).toBe(true);
    expect(isScenarioName("nope")).toBe(false);
    expect(isScenarioName("toString")).toBe(false);
  });
});
