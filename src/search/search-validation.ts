import { isScenarioName, SCENARIO_NAMES, type ScenarioName } from "../providers/simulation.ts";
import type { FlightSearchRequest } from "./search-types.ts";

export const MAX_DATE_FLEXIBILITY_DAYS = 7;

export type ValidationResult =
  | { ok: true; value: FlightSearchRequest }
  | { ok: false; errors: string[] };

const LOCATION_CODE = /^[A-Z]{3}$/;

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    Temporal.PlainDate.from(value, { overflow: "reject" });
    return true;
  } catch {
    return false;
  }
}

function readLocation(body: Record<string, unknown>, field: string, errors: string[]): string {
  const value = body[field];
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!LOCATION_CODE.test(code)) errors.push(`${field} must be a 3-letter IATA airport or city code`);
  return code;
}

export function parseSearchRequest(body: unknown, defaultScenario: ScenarioName): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: ["request body must be a JSON object"] };
  }
  const input = body as Record<string, unknown>;
  const errors: string[] = [];

  const origin = readLocation(input, "origin", errors);
  const destination = readLocation(input, "destination", errors);
  if (origin && origin === destination) errors.push("origin and destination must differ");

  const departureDate = input.departureDate;
  if (typeof departureDate !== "string" || !isValidIsoDate(departureDate)) {
    errors.push("departureDate must be a valid date in YYYY-MM-DD format");
  }

  const preferences = (input.preferences ?? {}) as Record<string, unknown>;
  if (typeof preferences !== "object" || Array.isArray(preferences)) {
    errors.push("preferences must be an object");
  }
  const dateFlexibilityDays = preferences.dateFlexibilityDays ?? 0;
  if (
    typeof dateFlexibilityDays !== "number" ||
    !Number.isInteger(dateFlexibilityDays) ||
    dateFlexibilityDays < 0 ||
    dateFlexibilityDays > MAX_DATE_FLEXIBILITY_DAYS
  ) {
    errors.push(`preferences.dateFlexibilityDays must be an integer between 0 and ${MAX_DATE_FLEXIBILITY_DAYS}`);
  }
  const allowAlternativeAirports = preferences.allowAlternativeAirports ?? false;
  if (typeof allowAlternativeAirports !== "boolean") {
    errors.push("preferences.allowAlternativeAirports must be a boolean");
  }

  const scenario = input.scenario ?? defaultScenario;
  if (!isScenarioName(scenario)) {
    errors.push(`scenario must be one of: ${SCENARIO_NAMES.join(", ")}`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      origin,
      destination,
      departureDate: departureDate as string,
      preferences: {
        dateFlexibilityDays: dateFlexibilityDays as number,
        allowAlternativeAirports: allowAlternativeAirports as boolean,
      },
      scenario: scenario as ScenarioName,
    },
  };
}
