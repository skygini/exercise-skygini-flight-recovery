import type { ProviderName } from "../search/search-types.ts";

/**
 * Named provider scenarios. Each one overrides the behavior of specific providers;
 * providers not listed behave normally. Latencies are deterministic per request.
 */
export const SCENARIOS = {
  normal: {},
  "slow-provider": { B: "slow" },
  "provider-timeout": { B: "hang" },
  "provider-failure": { C: "error" },
  "provider-a-failure": { A: "error" },
  "provider-c-empty": { C: "empty" },
  "provider-c-malformed": { C: "malformed" },
} as const satisfies Record<string, ScenarioBehavior>;

interface ScenarioBehavior {
  A?: "error";
  B?: "slow" | "hang";
  C?: "error" | "empty" | "malformed";
}

export type ScenarioName = keyof typeof SCENARIOS;
export const SCENARIO_NAMES = Object.keys(SCENARIOS) as ScenarioName[];

export function isScenarioName(value: unknown): value is ScenarioName {
  return typeof value === "string" && Object.hasOwn(SCENARIOS, value);
}

export function behaviorFor<P extends ProviderName>(
  provider: P,
  scenario: ScenarioName | undefined,
): NonNullable<ScenarioBehavior[P]> | "normal" {
  const behavior: ScenarioBehavior = SCENARIOS[scenario ?? "normal"];
  return behavior[provider] ?? "normal";
}

export interface ProviderCallOptions {
  signal?: AbortSignal;
  /** Scales every simulated latency. 1 = realistic, 0.1 = fast tests. */
  latencyMultiplier?: number;
}

export interface ProviderSearchRequest {
  origin: string;
  destination: string;
  departureDate: string;
  scenario?: ScenarioName;
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Same seed → same latency, always inside [minMs, maxMs] before scaling. */
export function simulatedLatencyMs(seed: string, minMs: number, maxMs: number, multiplier = 1): number {
  const base = minMs + (fnv1a(seed) % (maxMs - minMs + 1));
  return Math.round(base * multiplier);
}

export function requestSeed(provider: ProviderName, request: ProviderSearchRequest): string {
  return `${provider}|${request.origin}|${request.destination}|${request.departureDate}`;
}

/** Non-blocking, abortable delay. Rejects with `signal.reason` and clears its timer on abort. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
