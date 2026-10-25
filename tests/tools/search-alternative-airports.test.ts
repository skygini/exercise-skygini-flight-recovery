import { beforeEach, describe, expect, it } from "vitest";
import { alternativeAirportsFor, searchAlternativeAirports } from "../../src/agent/tools/search-alternative-airports.ts";
import { ToolInputError } from "../../src/agent/tools/tool-errors.ts";
import { resetProviderC } from "../../src/providers/provider-c.ts";
import { queryAllProviders } from "../../src/search/search-service.ts";
import { FAST_SEARCH_CONFIG, searchContext } from "../helpers.ts";

beforeEach(() => resetProviderC());

const scenarioB = searchContext({
  departureDate: "2027-05-20",
  preferences: { dateFlexibilityDays: 0, allowAlternativeAirports: true },
});

describe("alternativeAirportsFor", () => {
  it("lists sibling airports from the predefined mapping", () => {
    expect(alternativeAirportsFor({ origin: "TLV", destination: "LON" })).toEqual({ origin: [], destination: ["LGW", "LTN", "STN"] });
    expect(alternativeAirportsFor({ origin: "TLV", destination: "ORY" })).toEqual({ origin: [], destination: ["CDG"] });
    expect(alternativeAirportsFor({ origin: "EWR", destination: "PAR" })).toEqual({ origin: ["JFK"], destination: ["ORY"] });
  });
});

describe("searchAlternativeAirports", () => {
  it("Scenario B: the original London search is expensive, Luton and Gatwick are cheaper", async () => {
    const original = await queryAllProviders(
      { origin: "TLV", destination: "LON", departureDate: "2027-05-20", scenario: "normal" },
      FAST_SEARCH_CONFIG,
    );
    expect(original.offers[0]?.price).toBe(585);

    const luton = await searchAlternativeAirports(scenarioB, "LTN", FAST_SEARCH_CONFIG);
    expect(luton.query.destination).toBe("LTN");
    expect(luton.offers[0]).toMatchObject({ id: "B-209", destination: "LTN", price: 389 });

    const gatwick = await searchAlternativeAirports(scenarioB, "lgw", FAST_SEARCH_CONFIG);
    expect(gatwick.offers[0]).toMatchObject({ id: "B-208", destination: "LGW", price: 455 });

    const stansted = await searchAlternativeAirports(scenarioB, "STN", FAST_SEARCH_CONFIG);
    expect(stansted.offers[0]!.price).toBeGreaterThan(585);
  });

  it("Scenario A: Gatwick is 20% cheaper only with a long connection", async () => {
    const gatwick = await searchAlternativeAirports(searchContext(), "LGW", FAST_SEARCH_CONFIG);
    expect(gatwick.offers[0]).toMatchObject({ id: "A-143", price: 504, stops: 1, durationMinutes: 845 });
  });

  it("Scenario F: Orly does not beat the original Paris price", async () => {
    const paris = searchContext({ destination: "PAR", departureDate: "2027-04-10" });
    const orly = await searchAlternativeAirports(paris, "ORY", FAST_SEARCH_CONFIG);
    expect(orly.offers[0]!.price).toBeGreaterThan(214);
  });

  it("replaces the origin when the airport is an alternative for it", async () => {
    const result = await searchAlternativeAirports(
      searchContext({ origin: "JFK", destination: "LON" }),
      "EWR",
      FAST_SEARCH_CONFIG,
    );
    expect(result.query).toMatchObject({ origin: "EWR", destination: "LON" });
  });

  it("refuses when the traveller does not allow alternative airports", async () => {
    const strict = searchContext({ preferences: { dateFlexibilityDays: 1, allowAlternativeAirports: false } });
    await expect(searchAlternativeAirports(strict, "LTN", FAST_SEARCH_CONFIG)).rejects.toThrow(ToolInputError);
  });

  it.each([
    ["an airport in another city", "CDG"],
    ["the airport already searched", "LHR"],
    ["an unknown code", "XXX"],
  ])("rejects %s", async (_label, code) => {
    await expect(searchAlternativeAirports(scenarioB, code, FAST_SEARCH_CONFIG)).rejects.toThrow(
      "is not an alternative airport",
    );
  });

  it("reports provider failures instead of throwing", async () => {
    const result = await searchAlternativeAirports({ ...scenarioB, scenario: "slow-provider" }, "LTN", FAST_SEARCH_CONFIG);
    expect(result.providerResults.B).toMatchObject({ status: "failed", error: { code: "timeout" } });
    expect(result.offers.length).toBeGreaterThan(0);
  });
});
