import { describe, expect, it } from "vitest";
import { runFlightRecoveryAgent } from "../../src/agent/flight-recovery-agent.ts";
import { createEventBus } from "../../src/events/event-bus.ts";
import { createSearchCompletedEvent, type SearchCompletedEvent } from "../../src/events/search-completed.ts";
import { buildRecoveryInput } from "../../src/worker/recovery-worker.ts";
import { FAST_SEARCH_CONFIG } from "../helpers.ts";

function sampleEvent(): SearchCompletedEvent {
  return createSearchCompletedEvent({
    searchId: "search-1",
    status: "completed",
    origin: "TLV",
    destination: "LON",
    departureDate: "2027-11-15",
    preferences: { dateFlexibilityDays: 1, allowAlternativeAirports: true },
    scenario: "normal",
    offers: [],
    providerResults: {
      A: { status: "success", offerCount: 0 },
      B: { status: "success", offerCount: 0 },
      C: { status: "success", offerCount: 0 },
    },
    durationMs: 1,
  });
}

describe("event bus", () => {
  it("dispatches asynchronously: publish returns before any handler runs", async () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.subscribe("SearchCompleted", () => {
      calls.push("handler");
    });

    bus.publish(sampleEvent());
    calls.push("after publish");
    await bus.waitForIdle();

    expect(calls).toEqual(["after publish", "handler"]);
  });

  it("does not wait for slow consumers", async () => {
    const bus = createEventBus();
    bus.subscribe("SearchCompleted", () => new Promise((resolve) => setTimeout(resolve, 200)));

    const startedAt = performance.now();
    bus.publish(sampleEvent());
    expect(performance.now() - startedAt).toBeLessThan(20);
    await bus.waitForIdle();
  });

  it("contains handler failures, including the unfinished agent, and keeps other consumers running", async () => {
    const bus = createEventBus();
    let otherHandlerRan = false;
    bus.subscribe("SearchCompleted", (event) =>
      runFlightRecoveryAgent(buildRecoveryInput(event), { searchConfig: FAST_SEARCH_CONFIG }).then(() => undefined),
    );
    bus.subscribe("SearchCompleted", () => {
      otherHandlerRan = true;
    });

    bus.publish(sampleEvent());
    await expect(bus.waitForIdle()).resolves.toBeUndefined();
    expect(otherHandlerRan).toBe(true);
  });

  it("supports unsubscribing", async () => {
    const bus = createEventBus();
    let calls = 0;
    const unsubscribe = bus.subscribe("SearchCompleted", () => {
      calls++;
    });
    unsubscribe();
    bus.publish(sampleEvent());
    await bus.waitForIdle();
    expect(calls).toBe(0);
  });
});

describe("createSearchCompletedEvent", () => {
  it("reports a null cheapest price when there are no offers", () => {
    expect(sampleEvent()).toMatchObject({ type: "SearchCompleted", searchId: "search-1", cheapestOriginalPrice: null });
  });
});
