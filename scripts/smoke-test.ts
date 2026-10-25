/**
 * End-to-end smoke test over real HTTP with realistic latencies.
 * Starts its own server on a random port (does not touch a running `npm run dev`).
 */
process.env.LOG_LEVEL ??= "error";

import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { searchAlternativeAirports } from "../src/agent/tools/search-alternative-airports.ts";
import { searchNearbyDates } from "../src/agent/tools/search-nearby-dates.ts";
import { ToolExecutionError } from "../src/agent/tools/tool-errors.ts";
import { createApplication } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import type { SearchResponse } from "../src/search/search-types.ts";

const config = { ...loadConfig(), port: 0 };
const { app, eventBus } = createApplication(config);
const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const scenarioA = {
  origin: "TLV",
  destination: "LON",
  departureDate: "2027-11-15",
  preferences: { dateFlexibilityDays: 1, allowAlternativeAirports: true },
};

async function search(body: object): Promise<{ status: number; body: SearchResponse }> {
  const response = await fetch(`${baseUrl}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as SearchResponse };
}

function summarize(result: SearchResponse): string {
  const providers = Object.entries(result.providerResults)
    .map(([name, r]) => `${name}:${r.status === "success" ? "ok" : r.error.code}`)
    .join(" ");
  return `${result.status}, ${result.offers.length} offers, cheapest $${result.offers[0]?.price ?? "-"}, ${result.durationMs} ms [${providers}]`;
}

const checks: Array<[string, () => Promise<string>]> = [
  ["GET /health", async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    return "ok";
  }],
  ["Scenario A: normal search", async () => {
    const { status, body } = await search(scenarioA);
    assert.equal(status, 200);
    assert.equal(body.status, "completed");
    assert.equal(body.offers[0]?.price, 630);
    return summarize(body);
  }],
  ["Recovery status after search", async () => {
    const { body } = await search(scenarioA);
    await eventBus.waitForIdle();
    const response = await fetch(`${baseUrl}/searches/${body.searchId}/recovery`);
    const recovery = (await response.json()) as { status: string };
    assert.equal(response.status, 200);
    assert.equal(recovery.status, "pending");
    return `status=${recovery.status}`;
  }],
  ["Scenario C: slow Provider B times out", async () => {
    const { body } = await search({ ...scenarioA, scenario: "slow-provider" });
    assert.equal(body.status, "partial");
    assert.equal(body.providerResults.B.status === "failed" && body.providerResults.B.error.code, "timeout");
    assert.ok(body.offers.length > 0);
    return summarize(body);
  }],
  ["Scenario D: Provider C server error", async () => {
    const { body } = await search({ ...scenarioA, scenario: "provider-failure" });
    assert.equal(body.status, "partial");
    assert.equal(body.providerResults.C.status === "failed" && body.providerResults.C.error.code, "unavailable");
    return summarize(body);
  }],
  ["Scenario E: 5 concurrent searches hit Provider C's rate limit", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => search(scenarioA)));
    const limited = results.filter(
      (r) => r.body.providerResults.C.status === "failed" && r.body.providerResults.C.error.code === "rate_limited",
    ).length;
    assert.ok(limited > 0, "expected at least one rate-limited Provider C call");
    assert.ok(results.every((r) => r.body.offers.length > 0));
    return `${limited}/5 rate-limited on C, all 5 returned offers`;
  }],
  ["Invalid request returns 400", async () => {
    const { status } = await search({ origin: "TLV" });
    assert.equal(status, 400);
    return "400";
  }],
  ["Tool searchNearbyDates (Scenario A, -1 day)", async () => {
    const result = await searchNearbyDates({ searchId: "smoke", scenario: "normal", ...scenarioA }, -1, config.search);
    assert.equal(result.offers[0]?.price, 480);
    return `cheapest $${result.offers[0]?.price} (${result.offers[0]?.id}) on ${result.query.departureDate}`;
  }],
  ["Tool searchAlternativeAirports (Scenario B, LTN)", async () => {
    const result = await searchAlternativeAirports(
      {
        searchId: "smoke",
        scenario: "normal",
        ...scenarioA,
        departureDate: "2027-05-20",
        preferences: { dateFlexibilityDays: 0, allowAlternativeAirports: true },
      },
      "LTN",
      config.search,
    );
    assert.equal(result.offers[0]?.price, 389);
    return `cheapest $${result.offers[0]?.price} (${result.offers[0]?.id}) to ${result.query.destination}`;
  }],
  ["Scenario G: dates tool fails, EWR is not cheaper", async () => {
    const search = { searchId: "smoke", scenario: "normal" as const, ...scenarioA, destination: "NYC", departureDate: "2027-06-10" };
    const dateError = await searchNearbyDates(search, -1, config.search).catch((error: unknown) => error);
    assert.ok(dateError instanceof ToolExecutionError, "expected ToolExecutionError from searchNearbyDates");
    const newark = await searchAlternativeAirports(search, "EWR", config.search);
    assert.ok(newark.offers[0]!.price > 780);
    return `dates: ${dateError.message}; EWR cheapest $${newark.offers[0]!.price}`;
  }],
];

let failures = 0;
for (const [name, run] of checks) {
  try {
    console.log(`✔ ${name} — ${await run()}`);
  } catch (error) {
    failures++;
    console.log(`✘ ${name} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

await eventBus.waitForIdle();
server.close();
console.log(failures === 0 ? `\nSmoke test passed (${checks.length} checks).` : `\nSmoke test FAILED (${failures} of ${checks.length}).`);
process.exitCode = failures === 0 ? 0 : 1;
