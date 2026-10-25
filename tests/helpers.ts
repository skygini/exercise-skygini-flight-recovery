import type { AddressInfo } from "node:net";
import type { FlightSearchContext } from "../src/agent/agent-types.ts";
import { createApplication, type Application } from "../src/app.ts";
import type { AppConfig } from "../src/config.ts";
import type { SearchConfig } from "../src/search/search-types.ts";

/** Latencies at 10%: A 8–20 ms, B 90–150 ms (slow 300–500 ms), C 20–70 ms. */
export const FAST_SEARCH_CONFIG: SearchConfig = {
  providerTimeoutMs: 250,
  providerCMaxConcurrent: 3,
  latencyMultiplier: 0.1,
};

export function testAppConfig(search: Partial<SearchConfig> = {}): AppConfig {
  return { port: 0, defaultScenario: "normal", search: { ...FAST_SEARCH_CONFIG, ...search } };
}

export interface TestServer {
  baseUrl: string;
  application: Application;
  close(): Promise<void>;
}

export async function startTestServer(config: AppConfig = testAppConfig()): Promise<TestServer> {
  const application = createApplication(config);
  const server = application.app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    application,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

export function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function searchContext(overrides: Partial<FlightSearchContext> = {}): FlightSearchContext {
  return {
    searchId: "search-test",
    origin: "TLV",
    destination: "LON",
    departureDate: "2027-11-15",
    preferences: { dateFlexibilityDays: 1, allowAlternativeAirports: true },
    scenario: "normal",
    ...overrides,
  };
}

export function activeTimers(): number {
  return process.getActiveResourcesInfo().filter((resource) => resource === "Timeout").length;
}
