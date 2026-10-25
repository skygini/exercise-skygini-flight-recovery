import type { ProviderName } from "../search/search-types.ts";
import { resolveAirport } from "./airports.ts";

/**
 * Synthetic, deterministic inventory shared by the three mock providers.
 * Each provider converts these rows into its own response schema.
 *
 * Story routes (all prices USD):
 *   Scenario A  TLV→LON 2027-11-15  cheapest 630; 2027-11-14 has a $480 offer (B-203);
 *                                   LGW has $504 (A-143), but with a ~8 h connection
 *   Scenario B  TLV→LON 2027-05-20  cheapest 585 at LHR; LTN has $389 (B-209), LGW $455 (B-208)
 *   Scenario F  TLV→PAR 2027-04-10  cheapest 214; nearby dates and ORY are all more expensive
 *   Scenario G  TLV→NYC 2027-06-10  cheapest 780; every provider is down on 06-09 and 06-11,
 *                                   EWR is more expensive
 * Routes and dates without rows below return zero offers.
 */

interface ScheduledFlight {
  airline: string;
  origin: string;
  destination: string;
  departureTime: string;
  durationMinutes: number;
  stops: number;
}

export interface InventoryOffer extends ScheduledFlight {
  provider: ProviderName;
  offerId: string;
  flightNumber: string;
  departureDate: string;
  priceUsd: number;
}

const SCHEDULE: Record<string, ScheduledFlight> = {
  LV315: { airline: "Levant Air", origin: "TLV", destination: "LHR", departureTime: "06:10", durationMinutes: 330, stops: 0 },
  LV317: { airline: "Levant Air", origin: "TLV", destination: "LHR", departureTime: "15:40", durationMinutes: 330, stops: 0 },
  CW401: { airline: "Cedar Wings", origin: "TLV", destination: "LHR", departureTime: "09:45", durationMinutes: 360, stops: 0 },
  NB220: { airline: "Northbridge Airways", origin: "TLV", destination: "LHR", departureTime: "13:20", durationMinutes: 410, stops: 1 },
  AU118: { airline: "Aurora Air", origin: "TLV", destination: "LHR", departureTime: "17:05", durationMinutes: 335, stops: 0 },
  MJ512: { airline: "Mistral Jet", origin: "TLV", destination: "LHR", departureTime: "07:30", durationMinutes: 395, stops: 1 },
  SC77: { airline: "Skyline Connect", origin: "TLV", destination: "LHR", departureTime: "22:15", durationMinutes: 460, stops: 1 },

  NB224: { airline: "Northbridge Airways", origin: "TLV", destination: "LGW", departureTime: "11:00", durationMinutes: 340, stops: 0 },
  CW405: { airline: "Cedar Wings", origin: "TLV", destination: "LGW", departureTime: "18:30", durationMinutes: 345, stops: 0 },
  AU130: { airline: "Aurora Air", origin: "TLV", destination: "LGW", departureTime: "14:10", durationMinutes: 350, stops: 0 },
  MJ530: { airline: "Mistral Jet", origin: "TLV", destination: "LGW", departureTime: "05:50", durationMinutes: 400, stops: 1 },
  MJ534: { airline: "Mistral Jet", origin: "TLV", destination: "LGW", departureTime: "06:05", durationMinutes: 845, stops: 1 },

  SC81: { airline: "Skyline Connect", origin: "TLV", destination: "LTN", departureTime: "04:55", durationMinutes: 345, stops: 0 },
  MJ540: { airline: "Mistral Jet", origin: "TLV", destination: "LTN", departureTime: "12:35", durationMinutes: 350, stops: 0 },
  LV341: { airline: "Levant Air", origin: "TLV", destination: "LTN", departureTime: "20:10", durationMinutes: 345, stops: 0 },

  AU140: { airline: "Aurora Air", origin: "TLV", destination: "STN", departureTime: "08:20", durationMinutes: 355, stops: 0 },
  SC85: { airline: "Skyline Connect", origin: "TLV", destination: "STN", departureTime: "16:45", durationMinutes: 420, stops: 1 },
  NB236: { airline: "Northbridge Airways", origin: "TLV", destination: "STN", departureTime: "21:40", durationMinutes: 360, stops: 0 },

  LV323: { airline: "Levant Air", origin: "TLV", destination: "CDG", departureTime: "07:00", durationMinutes: 290, stops: 0 },
  CW411: { airline: "Cedar Wings", origin: "TLV", destination: "CDG", departureTime: "10:30", durationMinutes: 295, stops: 0 },
  AU150: { airline: "Aurora Air", origin: "TLV", destination: "CDG", departureTime: "15:15", durationMinutes: 300, stops: 0 },
  MJ560: { airline: "Mistral Jet", origin: "TLV", destination: "CDG", departureTime: "06:20", durationMinutes: 360, stops: 1 },
  SC91: { airline: "Skyline Connect", origin: "TLV", destination: "CDG", departureTime: "23:30", durationMinutes: 380, stops: 1 },

  NB250: { airline: "Northbridge Airways", origin: "TLV", destination: "ORY", departureTime: "09:10", durationMinutes: 300, stops: 0 },
  MJ566: { airline: "Mistral Jet", origin: "TLV", destination: "ORY", departureTime: "13:45", durationMinutes: 305, stops: 0 },
  SC95: { airline: "Skyline Connect", origin: "TLV", destination: "ORY", departureTime: "19:20", durationMinutes: 310, stops: 0 },

  LV001: { airline: "Levant Air", origin: "TLV", destination: "JFK", departureTime: "00:45", durationMinutes: 735, stops: 0 },
  CW501: { airline: "Cedar Wings", origin: "TLV", destination: "JFK", departureTime: "10:15", durationMinutes: 760, stops: 0 },
  NB610: { airline: "Northbridge Airways", origin: "TLV", destination: "JFK", departureTime: "06:30", durationMinutes: 905, stops: 1 },
  AU700: { airline: "Aurora Air", origin: "TLV", destination: "JFK", departureTime: "23:10", durationMinutes: 745, stops: 0 },
  MJ720: { airline: "Mistral Jet", origin: "TLV", destination: "JFK", departureTime: "05:40", durationMinutes: 960, stops: 1 },

  LV029: { airline: "Levant Air", origin: "TLV", destination: "EWR", departureTime: "01:20", durationMinutes: 740, stops: 0 },
  SC301: { airline: "Skyline Connect", origin: "TLV", destination: "EWR", departureTime: "12:50", durationMinutes: 930, stops: 1 },
  AU712: { airline: "Aurora Air", origin: "TLV", destination: "EWR", departureTime: "16:25", durationMinutes: 750, stops: 0 },
};

type OfferRow = [provider: ProviderName, offerId: string, flightNumber: string, departureDate: string, priceUsd: number];

const OFFER_ROWS: OfferRow[] = [
  // Scenario A — TLV→LHR 2027-11-15 (original search, cheapest 630)
  ["A", "101", "LV315", "2027-11-15", 655],
  ["A", "102", "CW401", "2027-11-15", 690],
  ["A", "103", "NB220", "2027-11-15", 630],
  ["A", "104", "AU118", "2027-11-15", 720],
  ["B", "201", "MJ512", "2027-11-15", 645],
  ["B", "202", "LV317", "2027-11-15", 668],
  ["C", "301", "LV315", "2027-11-15", 649],
  ["C", "302", "SC77", "2027-11-15", 710],
  // Scenario A — one day earlier has the $480 deal
  ["A", "105", "LV315", "2027-11-14", 560],
  ["A", "106", "CW401", "2027-11-14", 595],
  ["A", "107", "NB220", "2027-11-14", 540],
  ["B", "203", "MJ512", "2027-11-14", 480],
  ["B", "204", "LV317", "2027-11-14", 545],
  ["C", "303", "SC77", "2027-11-14", 575],
  // Scenario A — one day later is not better
  ["A", "108", "LV315", "2027-11-16", 640],
  ["A", "109", "CW401", "2027-11-16", 675],
  ["A", "110", "AU118", "2027-11-16", 699],
  ["B", "205", "LV317", "2027-11-16", 662],
  ["C", "304", "SC77", "2027-11-16", 690],
  ["C", "305", "NB220", "2027-11-16", 645],
  // Scenario A — Gatwick on the original date: 20% cheaper only with a long connection
  ["A", "111", "NB224", "2027-11-15", 612],
  ["A", "112", "CW405", "2027-11-15", 640],
  ["A", "113", "AU130", "2027-11-15", 655],
  ["A", "143", "MJ534", "2027-11-15", 504],
  ["B", "206", "MJ530", "2027-11-15", 605],
  ["C", "306", "NB224", "2027-11-15", 615],

  // Scenario B — TLV→LHR 2027-05-20 (original search, cheapest 585)
  ["A", "114", "LV315", "2027-05-20", 610],
  ["A", "115", "CW401", "2027-05-20", 640],
  ["A", "116", "NB220", "2027-05-20", 585],
  ["A", "117", "AU118", "2027-05-20", 655],
  ["B", "207", "MJ512", "2027-05-20", 598],
  ["C", "307", "SC77", "2027-05-20", 620],
  // Scenario B — Gatwick
  ["A", "118", "NB224", "2027-05-20", 470],
  ["A", "119", "CW405", "2027-05-20", 495],
  ["A", "120", "AU130", "2027-05-20", 520],
  ["B", "208", "MJ530", "2027-05-20", 455],
  ["C", "308", "NB224", "2027-05-20", 465],
  // Scenario B — Luton (cheapest alternative)
  ["A", "121", "SC81", "2027-05-20", 415],
  ["A", "122", "MJ540", "2027-05-20", 430],
  ["A", "123", "LV341", "2027-05-20", 445],
  ["B", "209", "SC81", "2027-05-20", 389],
  ["C", "309", "MJ540", "2027-05-20", 425],
  // Scenario B — Stansted (no improvement)
  ["A", "124", "AU140", "2027-05-20", 590],
  ["A", "125", "SC85", "2027-05-20", 605],
  ["A", "126", "NB236", "2027-05-20", 620],
  ["C", "310", "AU140", "2027-05-20", 596],
  // TLV→LHR 2027-05-19
  ["A", "140", "LV315", "2027-05-19", 420],
  ["A", "141", "CW401", "2027-05-19", 445],
  ["A", "142", "NB220", "2027-05-19", 399],
  ["B", "214", "MJ512", "2027-05-19", 299],
  ["C", "316", "SC77", "2027-05-19", 410],

  // Scenario F — TLV→CDG 2027-04-10 (original search, cheapest 214)
  ["A", "127", "LV323", "2027-04-10", 214],
  ["A", "128", "CW411", "2027-04-10", 236],
  ["A", "129", "AU150", "2027-04-10", 249],
  ["A", "130", "MJ560", "2027-04-10", 228],
  ["B", "210", "SC91", "2027-04-10", 222],
  ["C", "311", "LV323", "2027-04-10", 219],
  ["C", "312", "CW411", "2027-04-10", 240],
  // Scenario F — nearby dates
  ["A", "131", "LV323", "2027-04-09", 268],
  ["A", "132", "CW411", "2027-04-09", 279],
  ["A", "133", "AU150", "2027-04-09", 295],
  ["B", "211", "MJ560", "2027-04-09", 265],
  ["C", "313", "SC91", "2027-04-09", 285],
  ["A", "134", "LV323", "2027-04-11", 272],
  ["A", "135", "CW411", "2027-04-11", 288],
  ["A", "136", "AU150", "2027-04-11", 299],
  ["B", "212", "SC91", "2027-04-11", 281],
  ["C", "314", "MJ560", "2027-04-11", 276],
  // Scenario F — Orly
  ["A", "137", "NB250", "2027-04-10", 238],
  ["A", "138", "MJ566", "2027-04-10", 252],
  ["A", "139", "SC95", "2027-04-10", 261],
  ["B", "213", "MJ566", "2027-04-10", 245],
  ["C", "315", "NB250", "2027-04-10", 241],

  // Scenario G — TLV→JFK 2027-06-10 (original search, cheapest 780)
  ["A", "144", "LV001", "2027-06-10", 820],
  ["A", "145", "CW501", "2027-06-10", 845],
  ["A", "146", "NB610", "2027-06-10", 780],
  ["A", "147", "AU700", "2027-06-10", 865],
  ["B", "215", "MJ720", "2027-06-10", 795],
  ["C", "317", "LV001", "2027-06-10", 812],
  // Scenario G — Newark (no improvement)
  ["A", "148", "LV029", "2027-06-10", 830],
  ["A", "149", "SC301", "2027-06-10", 805],
  ["A", "150", "AU712", "2027-06-10", 870],
  ["B", "216", "AU712", "2027-06-10", 852],
  ["C", "318", "SC301", "2027-06-10", 810],
];

/** Route/dates on which every provider answers with a server error. */
const PROVIDER_OUTAGES: ReadonlyArray<{ origin: string; destination: string; departureDate: string }> = [
  { origin: "TLV", destination: "JFK", departureDate: "2027-06-09" },
  { origin: "TLV", destination: "JFK", departureDate: "2027-06-11" },
];

function toInventoryOffer([provider, offerId, flightNumber, departureDate, priceUsd]: OfferRow): InventoryOffer {
  const flight = SCHEDULE[flightNumber];
  if (!flight) throw new Error(`Fixture references unknown flight ${flightNumber}`);
  return { ...flight, provider, offerId, flightNumber, departureDate, priceUsd };
}

const INVENTORY: readonly InventoryOffer[] = OFFER_ROWS.map(toInventoryOffer);

export function findInventory(
  provider: ProviderName,
  query: { origin: string; destination: string; departureDate: string },
): InventoryOffer[] {
  const origin = resolveAirport(query.origin);
  const destination = resolveAirport(query.destination);
  return INVENTORY.filter(
    (offer) =>
      offer.provider === provider &&
      offer.origin === origin &&
      offer.destination === destination &&
      offer.departureDate === query.departureDate,
  );
}

export function isProviderOutage(query: { origin: string; destination: string; departureDate: string }): boolean {
  const origin = resolveAirport(query.origin);
  const destination = resolveAirport(query.destination);
  return PROVIDER_OUTAGES.some(
    (outage) =>
      outage.origin === origin && outage.destination === destination && outage.departureDate === query.departureDate,
  );
}
