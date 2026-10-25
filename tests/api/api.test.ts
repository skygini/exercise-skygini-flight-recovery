import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SearchResponse } from "../../src/search/search-types.ts";
import { postJson, startTestServer, type TestServer } from "../helpers.ts";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

const scenarioA = {
  origin: "TLV",
  destination: "LON",
  departureDate: "2027-11-15",
  preferences: { dateFlexibilityDays: 1, allowAlternativeAirports: true },
};

describe("GET /health", () => {
  it("reports ok and the available scenarios", async () => {
    const response = await fetch(`${server.baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", scenarios: expect.arrayContaining(["normal", "slow-provider"]) });
  });
});

describe("POST /search", () => {
  it("returns normalized, sorted offers with provenance and provider results", async () => {
    const response = await postJson(`${server.baseUrl}/search`, scenarioA);
    expect(response.status).toBe(200);
    const body = (await response.json()) as SearchResponse;

    expect(body.searchId).toMatch(/^search-/);
    expect(body.status).toBe("completed");
    expect(body.offers[0]).toMatchObject({ id: "A-103", provider: "A", providerOfferId: "103", price: 630, currency: "USD" });
    const prices = body.offers.map((o) => o.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(Object.keys(body.providerResults).sort()).toEqual(["A", "B", "C"]);
  });

  it("returns partial results when a provider fails", async () => {
    const response = await postJson(`${server.baseUrl}/search`, { ...scenarioA, scenario: "provider-failure" });
    const body = (await response.json()) as SearchResponse;
    expect(response.status).toBe(200);
    expect(body.status).toBe("partial");
    expect(body.providerResults.C).toMatchObject({ status: "failed", error: { code: "unavailable" } });
    expect(body.offers.length).toBeGreaterThan(0);
  });

  it("rejects an invalid request with 400 and details", async () => {
    const response = await postJson(`${server.baseUrl}/search`, { origin: "TLV" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_ERROR", details: expect.any(Array) });
  });

  it("rejects malformed JSON with 400", async () => {
    const response = await postJson(`${server.baseUrl}/search`, "{not json");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_JSON" });
  });
});

describe("GET /searches/:searchId/recovery", () => {
  it("is pending after a search (agent not implemented yet)", async () => {
    const search = (await (await postJson(`${server.baseUrl}/search`, scenarioA)).json()) as SearchResponse;
    await server.application.eventBus.waitForIdle();

    const response = await fetch(`${server.baseUrl}/searches/${search.searchId}/recovery`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ searchId: search.searchId, status: "pending" });
  });

  it("returns 404 for an unknown search", async () => {
    const response = await fetch(`${server.baseUrl}/searches/search-unknown/recovery`);
    expect(response.status).toBe(404);
  });
});
