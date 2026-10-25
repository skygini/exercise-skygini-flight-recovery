import { describe, expect, it } from "vitest";
import {
  mergeOffers,
  normalizeProviderA,
  normalizeProviderB,
  normalizeProviderC,
} from "../../src/providers/normalization.ts";
import { searchProviderA } from "../../src/providers/provider-a.ts";
import { searchProviderB } from "../../src/providers/provider-b.ts";
import { searchProviderC } from "../../src/providers/provider-c.ts";
import { ProviderInvalidResponseError } from "../../src/providers/provider-errors.ts";
import type { FlightOffer } from "../../src/search/search-types.ts";

const LONDON = { origin: "TLV", destination: "LON", departureDate: "2027-11-15" };
const NO_LATENCY = { latencyMultiplier: 0 };

describe("normalization", () => {
  it("maps all three provider schemas onto the same FlightOffer shape", async () => {
    const a = normalizeProviderA(await searchProviderA(LONDON, NO_LATENCY));
    const b = normalizeProviderB(await searchProviderB(LONDON, NO_LATENCY));
    const c = normalizeProviderC(await searchProviderC(LONDON, NO_LATENCY));

    expect(a).toContainEqual({
      id: "A-101",
      provider: "A",
      providerOfferId: "101",
      origin: "TLV",
      destination: "LHR",
      departureDate: "2027-11-15",
      departureTime: "06:10",
      airline: "Levant Air",
      flightNumber: "LV315",
      durationMinutes: 330,
      stops: 0,
      price: 655,
      currency: "USD",
    });
    expect(b).toContainEqual(expect.objectContaining({ id: "B-201", price: 645, durationMinutes: 395, departureTime: "07:30" }));
    expect(c).toContainEqual(
      expect.objectContaining({ id: "C-301", price: 649, departureDate: "2027-11-15", departureTime: "06:10", stops: 0 }),
    );
  });

  it.each([
    ["null payload", null],
    ["wrong envelope", { status: "ERROR" }],
    ["results not an array", { status: "OK", data: { results: "<html>502</html>" } }],
    [
      "non-numeric price",
      {
        status: "OK",
        data: {
          results: [
            {
              offer_id: "1",
              route: "TLV-LHR",
              departure_date: "15/11/2027",
              departure_time: "0610",
              airline_name: "X",
              flight_code: "X1",
              duration_minutes: "300",
              stops: "0",
              total_price: "N/A",
              currency: "USD",
            },
          ],
        },
      },
    ],
  ])("rejects a malformed Provider C response (%s)", (_label, payload) => {
    expect(() => normalizeProviderC(payload)).toThrow(ProviderInvalidResponseError);
  });
});

describe("mergeOffers", () => {
  const offer = (overrides: Partial<FlightOffer>): FlightOffer => ({
    id: "A-1",
    provider: "A",
    providerOfferId: "1",
    origin: "TLV",
    destination: "LHR",
    departureDate: "2027-11-15",
    departureTime: "06:10",
    airline: "Levant Air",
    flightNumber: "LV315",
    durationMinutes: 330,
    stops: 0,
    price: 500,
    currency: "USD",
    ...overrides,
  });

  it("keeps only the cheapest offer for the same physical flight, with its provenance", () => {
    const merged = mergeOffers([
      offer({ id: "A-1", provider: "A", providerOfferId: "1", price: 655 }),
      offer({ id: "C-9", provider: "C", providerOfferId: "9", price: 649 }),
    ]);
    expect(merged).toEqual([expect.objectContaining({ id: "C-9", provider: "C", providerOfferId: "9", price: 649 })]);
  });

  it("sorts by price, then duration, then id", () => {
    const merged = mergeOffers([
      offer({ id: "B-2", flightNumber: "F2", price: 400, durationMinutes: 300 }),
      offer({ id: "A-3", flightNumber: "F3", price: 300 }),
      offer({ id: "A-4", flightNumber: "F4", price: 400, durationMinutes: 280 }),
    ]);
    expect(merged.map((o) => o.id)).toEqual(["A-3", "A-4", "B-2"]);
  });
});
