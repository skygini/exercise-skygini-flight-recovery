import { describe, expect, it } from "vitest";
import { parseSearchRequest } from "../../src/search/search-validation.ts";

describe("parseSearchRequest", () => {
  it("normalizes codes and applies default preferences and scenario", () => {
    const result = parseSearchRequest({ origin: "tlv", destination: " lon ", departureDate: "2027-11-15" }, "normal");
    expect(result).toEqual({
      ok: true,
      value: {
        origin: "TLV",
        destination: "LON",
        departureDate: "2027-11-15",
        preferences: { dateFlexibilityDays: 0, allowAlternativeAirports: false },
        scenario: "normal",
      },
    });
  });

  it("accepts explicit preferences and scenario", () => {
    const result = parseSearchRequest(
      {
        origin: "TLV",
        destination: "PAR",
        departureDate: "2027-04-10",
        preferences: { dateFlexibilityDays: 2, allowAlternativeAirports: true },
        scenario: "slow-provider",
      },
      "normal",
    );
    expect(result.ok && result.value.scenario).toBe("slow-provider");
  });

  it.each([
    [{}, "origin must be"],
    [{ origin: "TLV", destination: "TLV", departureDate: "2027-11-15" }, "must differ"],
    [{ origin: "TLV", destination: "LON", departureDate: "2027-02-30" }, "departureDate"],
    [{ origin: "TLV", destination: "LON", departureDate: "15/11/2027" }, "departureDate"],
    [{ origin: "TLV", destination: "LON", departureDate: "2027-11-15", preferences: { dateFlexibilityDays: 9 } }, "dateFlexibilityDays"],
    [{ origin: "TLV", destination: "LON", departureDate: "2027-11-15", preferences: { allowAlternativeAirports: "yes" } }, "allowAlternativeAirports"],
    [{ origin: "TLV", destination: "LON", departureDate: "2027-11-15", scenario: "chaos" }, "scenario must be one of"],
  ])("rejects invalid input %#", (body, expectedError) => {
    const result = parseSearchRequest(body, "normal");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("; ")).toContain(expectedError);
  });

  it("rejects a non-object body", () => {
    expect(parseSearchRequest([1, 2], "normal")).toEqual({ ok: false, errors: ["request body must be a JSON object"] });
  });
});
