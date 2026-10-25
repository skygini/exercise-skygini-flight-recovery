import { beforeEach, describe, expect, it } from "vitest";
import { searchNearbyDates, shiftDate } from "../../src/agent/tools/search-nearby-dates.ts";
import { ToolInputError } from "../../src/agent/tools/tool-errors.ts";
import { resetProviderC } from "../../src/providers/provider-c.ts";
import { FAST_SEARCH_CONFIG, searchContext } from "../helpers.ts";

beforeEach(() => resetProviderC());

describe("searchNearbyDates", () => {
  it("Scenario A: finds the $480 offer one day earlier", async () => {
    const result = await searchNearbyDates(searchContext(), -1, FAST_SEARCH_CONFIG);
    expect(result.query.departureDate).toBe("2027-11-14");
    expect(result.offers[0]).toMatchObject({ id: "B-203", provider: "B", price: 480, departureDate: "2027-11-14" });
  });

  it("Scenario A: one day later is not cheaper than the original $630", async () => {
    const result = await searchNearbyDates(searchContext(), 1, FAST_SEARCH_CONFIG);
    expect(result.offers[0]?.price).toBe(640);
  });

  it("Scenario F: no nearby date beats the original $214", async () => {
    const paris = searchContext({ destination: "PAR", departureDate: "2027-04-10" });
    for (const offset of [-1, 1]) {
      const result = await searchNearbyDates(paris, offset, FAST_SEARCH_CONFIG);
      expect(result.offers.length).toBeGreaterThan(0);
      expect(result.offers[0]!.price).toBeGreaterThan(214);
    }
  });

  it("rejects offsets beyond the traveller's flexibility", async () => {
    await expect(searchNearbyDates(searchContext(), 2, FAST_SEARCH_CONFIG)).rejects.toThrow(ToolInputError);
    await expect(
      searchNearbyDates(searchContext({ preferences: { dateFlexibilityDays: 0, allowAlternativeAirports: true } }), 1, FAST_SEARCH_CONFIG),
    ).rejects.toThrow("exceeds the traveller's date flexibility");
  });

  it.each([0, 0.5, Number.NaN])("rejects invalid offset %s", async (offset) => {
    await expect(searchNearbyDates(searchContext(), offset, FAST_SEARCH_CONFIG)).rejects.toThrow(ToolInputError);
  });

  it("reports provider failures instead of throwing", async () => {
    const result = await searchNearbyDates(searchContext({ scenario: "provider-failure" }), -1, FAST_SEARCH_CONFIG);
    expect(result.providerResults.C).toMatchObject({ status: "failed", error: { code: "unavailable" } });
    expect(result.offers[0]?.price).toBe(480);
  });
});

describe("shiftDate", () => {
  it("handles month and year boundaries", () => {
    expect(shiftDate("2027-03-01", -1)).toBe("2027-02-28");
    expect(shiftDate("2027-12-31", 1)).toBe("2028-01-01");
  });
});
