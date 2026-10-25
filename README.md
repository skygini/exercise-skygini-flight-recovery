# SkyGini Flight Search — Recovery Agent Challenge

A self-contained flight search API with three simulated suppliers. It is the starting point for the
**AI Flight Recovery Agent** challenge: see [CANDIDATE_CHALLENGE.md](CANDIDATE_CHALLENGE.md).

Everything except the agent works out of the box. No database, Docker, cloud services or API key needed.

## Quick start

Requires **Node.js 26** (`.nvmrc` is included; `nvm use` or `fnm use`).

```bash
npm install
npm run dev          # http://localhost:4000, restarts on file changes
```

```bash
curl -s localhost:4000/search -H 'content-type: application/json' -d '{
  "origin": "TLV",
  "destination": "LON",
  "departureDate": "2027-11-15",
  "preferences": { "dateFlexibilityDays": 1, "allowAlternativeAirports": true }
}' | jq
```

| Script | What it does |
|---|---|
| `npm run dev` | Start the API with watch mode (Node runs the TypeScript directly) |
| `npm test` | Vitest suite (offline, ~3 s) |
| `npm run typecheck` | `tsc --noEmit` over src, tests and scripts |
| `npm run build` / `npm start` | Compile to `dist/` and run the compiled server |
| `npm run smoke` | End-to-end check over HTTP with realistic latencies (~8 s) |

## Architecture

One Express server. The providers are **in-process async functions**, not HTTP services.

```text
POST /search ─► search-service ─► Promise.allSettled ─┬─► Provider A  (fast, reliable)
                                    per-provider       ├─► Provider B  (slow, best prices)
                                    timeout + abort    └─► Provider C  (unreliable, rate-limited)
                       │
                       ├─► normalize ─► merge / dedupe ─► sort by price ─► HTTP response
                       └─► publish SearchCompleted ─► event bus (async) ─► recovery worker
                                                                              └─► AI agent (TODO)
GET /searches/:searchId/recovery ◄── recovery store (pending | running | completed | failed)
```

| Path | Responsibility |
|---|---|
| `src/server.ts`, `src/app.ts` | Server entry point, Express app wiring |
| `src/api/` | `POST /search`, `GET /searches/:searchId/recovery` |
| `src/providers/` | Providers A/B/C, typed errors, scenarios + latency simulation, normalization |
| `src/search/` | Request validation, concurrent orchestration (`queryAllProviders`, `searchFlights`) |
| `src/events/` | In-memory event bus and the `SearchCompleted` event |
| `src/worker/` | Recovery worker (subscribes to `SearchCompleted`) — **agent call is TODO** |
| `src/agent/` | Agent skeleton (**TODO**), types, and the two working search tools |
| `src/storage/` | In-memory recovery store |
| `src/fixtures/` | Synthetic flight inventory and the city → airport mapping |

## API

### `POST /search`

| Field | Type | Notes |
|---|---|---|
| `origin`, `destination` | string | 3-letter IATA airport or city code (`LON`, `PAR`, `NYC` are cities) |
| `departureDate` | string | `YYYY-MM-DD` |
| `preferences.dateFlexibilityDays` | integer 0–7 | default 0 |
| `preferences.allowAlternativeAirports` | boolean | default false |
| `scenario` | string | optional provider scenario, see below; default `DEFAULT_SCENARIO` |

Response (`200`, also when some providers fail):

```json
{
  "searchId": "search-5f0c…",
  "status": "completed",
  "origin": "TLV", "destination": "LON", "departureDate": "2027-11-15",
  "preferences": { "dateFlexibilityDays": 1, "allowAlternativeAirports": true },
  "scenario": "normal",
  "offers": [
    { "id": "A-103", "provider": "A", "providerOfferId": "103", "origin": "TLV", "destination": "LHR",
      "departureDate": "2027-11-15", "departureTime": "13:20", "airline": "Northbridge Airways",
      "flightNumber": "NB220", "durationMinutes": 410, "stops": 1, "price": 630, "currency": "USD" }
  ],
  "providerResults": {
    "A": { "status": "success", "offerCount": 4 },
    "B": { "status": "success", "offerCount": 2 },
    "C": { "status": "failed", "error": { "code": "unavailable", "message": "Provider C: internal server error (HTTP 500)" } }
  },
  "durationMs": 921
}
```

- `status`: `completed` (all providers answered), `partial` (some failed), `failed` (none answered).
- Error codes: `timeout`, `unavailable`, `rate_limited`, `invalid_response`, `unknown`.
- When several providers sell the same flight (same flight number, route and date), only the cheapest offer is kept.
- Invalid input → `400 { "error": "VALIDATION_ERROR", "details": [...] }`.

### `GET /searches/:searchId/recovery`

Returns the recovery record created by the worker, e.g. `{ "searchId": "…", "status": "pending", "createdAt": "…", "updatedAt": "…" }`.
Unknown ids → `404`. Until the agent is implemented every recovery stays `pending`.

### `GET /health`

Liveness plus the list of scenarios.

## Providers

| | Latency | Schema quirks | Failure modes |
|---|---|---|---|
| **A** AeroFast | 80–200 ms | nested `carrier`, `fare.amount` | `provider-a-failure` → 503 |
| **B** SkyBazaar | 900–1,500 ms (slow: 3–5 s) | `priceCents`, ISO durations `PT5H30M` | `slow-provider`, `provider-timeout` (hangs) |
| **C** LegacyFares | 200–700 ms | strings everywhere, `DD/MM/YYYY`, `HHMM` | 500 error, empty, malformed, **max 3 concurrent requests** |

Latencies are deterministic (hashed from provider + route + date), so the same request always behaves the same way.
Each provider call gets an `AbortSignal`; on timeout the simulated delay is cancelled and Provider C's
concurrency slot is released.

## Scenarios

### Data scenarios (pick by route and date)

City codes resolve to the primary airport (`LON` → LHR, `PAR` → CDG, `NYC` → JFK). Routes and dates without fixtures return no offers.

| Scenario | Request | What the data contains |
|---|---|---|
| **A** Cheaper nearby date | TLV→LON `2027-11-15`, flexibility 1 | Original from $630. `2027-11-14` has $480 (`B-203`). `11-16` from $640. LGW has $504 (`A-143`), but it takes 14 h 05 m with one stop |
| **B** Alternative airports | TLV→LON `2027-05-20`, flexibility 0, alt airports allowed | Original from $585. LTN from $389 (`B-209`), LGW from $455, STN from $590 |
| **F** Nothing better | TLV→PAR `2027-04-10`, flexibility 1, alt airports allowed | Original from $214. `04-09` from $265, `04-11` from $272, ORY from $238 |
| **G** Tool failure | TLV→NYC `2027-06-10`, flexibility 1, alt airports allowed | Original from $780. Every provider is down on `06-09` and `06-11`, so `searchNearbyDates` throws `ToolExecutionError`. EWR from $805 |

### Provider scenarios (`"scenario"` field or `DEFAULT_SCENARIO`)

| `scenario` | Effect |
|---|---|
| `normal` | Default |
| `slow-provider` | **C** — B takes 3–5 s, the 2 s provider timeout cuts it off → partial results |
| `provider-timeout` | B never answers (hangs until the timeout aborts it) |
| `provider-failure` | **D** — C throws a server error, A and B still return offers |
| `provider-a-failure` | A throws a 503 |
| `provider-c-empty` | C returns zero results |
| `provider-c-malformed` | C returns a payload that fails validation → `invalid_response` |

**E — Rate limiting** works in any scenario: send more than 3 concurrent searches.

```bash
for i in 1 2 3 4 5; do
  curl -s localhost:4000/search -H 'content-type: application/json' \
    -d '{"origin":"TLV","destination":"LON","departureDate":"2027-11-15"}' | jq -c '.providerResults.C' &
done; wait
```

## Configuration

All optional; copy `.env.example` to `.env` (loaded automatically by `npm run dev` / `start` / `smoke`).

| Variable | Default | |
|---|---|---|
| `PORT` | 4000 | |
| `LOG_LEVEL` | info | `debug`, `info`, `warn`, `error`, `silent` |
| `DEFAULT_SCENARIO` | normal | scenario for requests that don't send one |
| `PROVIDER_TIMEOUT_MS` | 2000 | per-provider timeout |
| `PROVIDER_C_MAX_CONCURRENT` | 3 | Provider C rate limit |
| `SIMULATED_LATENCY_MULTIPLIER` | 1 | scale all simulated latencies |
| `ANTHROPIC_API_KEY` | — | only for the candidate's agent; `@anthropic-ai/sdk` is preinstalled but unused |

## Search tools

Plain async functions in `src/agent/tools/`, reusing the same concurrent provider search as `POST /search`:

- `searchNearbyDates(search, offsetDays, config)` re-runs the search `offsetDays` away from the original date.
- `searchAlternativeAirports(search, airportCode, config)` re-runs it with a sibling airport (`alternativeAirportsFor(search)` lists them).

Both return `{ query, offers, providerResults }`. They throw `ToolInputError` when the traveller's preferences
forbid the call, and `ToolExecutionError` when every provider failed. Partial failures only show up in `providerResults`.

## Tests

`tests/` covers providers (latency, errors, abort, rate limiting), normalization, orchestration
(concurrency, timeouts, partial results), validation, the event bus, the recovery store and worker,
both search tools, and the HTTP API. Tests run at 10% latency (`tests/helpers.ts`) and never touch the network.
