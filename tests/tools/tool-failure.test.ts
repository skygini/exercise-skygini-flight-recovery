import { beforeEach, describe, expect, it } from "vitest";
import { searchAlternativeAirports } from "../../src/agent/tools/search-alternative-airports.ts";
import { searchNearbyDates } from "../../src/agent/tools/search-nearby-dates.ts";
import { requireAnyProviderSuccess, ToolExecutionError } from "../../src/agent/tools/tool-errors.ts";
import { resetProviderC } from "../../src/providers/provider-c.ts";
import { queryAllProviders } from "../../src/search/search-service.ts";
import { FAST_SEARCH_CONFIG, searchContext } from "../helpers.ts";

beforeEach(() => resetProviderC());

const scenarioG = searchContext({ destination: "NYC", departureDate: "2027-06-10" });

describe("Scenario G: one tool fails, the other does not improve", () => {
  it("the original search is unaffected", async () => {
    const original = await queryAllProviders(
      { origin: "TLV", destination: "NYC", departureDate: "2027-06-10", scenario: "normal" },
      FAST_SEARCH_CONFIG,
    );
    expect(Object.values(original.providerResults).every((r) => r.status === "success")).toBe(true);
    expect(original.offers[0]).toMatchObject({ id: "A-146", price: 780 });
  });

  it.each([-1, 1])("searchNearbyDates(%i) throws ToolExecutionError because every provider is down", async (offset) => {
    const error = await searchNearbyDates(scenarioG, offset, FAST_SEARCH_CONFIG).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ToolExecutionError);
    expect((error as ToolExecutionError).providerResults).toEqual({
      A: { status: "failed", error: { code: "unavailable", message: expect.any(String) } },
      B: { status: "failed", error: { code: "unavailable", message: expect.any(String) } },
      C: { status: "failed", error: { code: "unavailable", message: expect.any(String) } },
    });
  });

  it("searchAlternativeAirports(EWR) works but is not cheaper than $780", async () => {
    const newark = await searchAlternativeAirports(scenarioG, "EWR", FAST_SEARCH_CONFIG);
    expect(newark.offers.length).toBeGreaterThan(0);
    expect(newark.offers[0]!.price).toBeGreaterThan(780);
  });
});

describe("requireAnyProviderSuccess", () => {
  it("passes through a result with at least one successful provider", () => {
    const result = {
      query: { origin: "TLV", destination: "LON", departureDate: "2027-11-15", scenario: "normal" as const },
      offers: [],
      providerResults: {
        A: { status: "success" as const, offerCount: 0 },
        B: { status: "failed" as const, error: { code: "timeout" as const, message: "t" } },
        C: { status: "failed" as const, error: { code: "unavailable" as const, message: "u" } },
      },
    };
    expect(requireAnyProviderSuccess(result)).toBe(result);
  });
});
