import { isScenarioName, type ScenarioName } from "./providers/simulation.ts";
import type { SearchConfig } from "./search/search-types.ts";

export interface AppConfig {
  port: number;
  defaultScenario: ScenarioName;
  search: SearchConfig;
}

function readNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${name}: expected a non-negative number, got "${raw}"`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const defaultScenario = env.DEFAULT_SCENARIO || "normal";
  if (!isScenarioName(defaultScenario)) {
    throw new Error(`Invalid DEFAULT_SCENARIO: "${defaultScenario}"`);
  }
  return {
    port: readNumber(env, "PORT", 4000),
    defaultScenario,
    search: {
      providerTimeoutMs: readNumber(env, "PROVIDER_TIMEOUT_MS", 2000),
      providerCMaxConcurrent: readNumber(env, "PROVIDER_C_MAX_CONCURRENT", 3),
      latencyMultiplier: readNumber(env, "SIMULATED_LATENCY_MULTIPLIER", 1),
    },
  };
}
