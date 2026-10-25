interface CityAirports {
  primary: string;
  airports: readonly string[];
}

export const CITY_AIRPORTS: Readonly<Record<string, CityAirports>> = {
  LON: { primary: "LHR", airports: ["LHR", "LGW", "LTN", "STN"] },
  PAR: { primary: "CDG", airports: ["CDG", "ORY"] },
  NYC: { primary: "JFK", airports: ["JFK", "EWR"] },
};

/** Mock providers treat a city code as that city's primary airport. */
export function resolveAirport(code: string): string {
  return CITY_AIRPORTS[code]?.primary ?? code;
}

/** The city code an airport (or city code) belongs to, if it is in the mapping. */
export function cityOf(code: string): string | undefined {
  if (CITY_AIRPORTS[code]) return code;
  return Object.keys(CITY_AIRPORTS).find((city) => CITY_AIRPORTS[city]?.airports.includes(code));
}

export function airportsForCity(city: string): readonly string[] {
  return CITY_AIRPORTS[city]?.airports ?? [];
}
