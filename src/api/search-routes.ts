import { Router } from "express";
import type { EventBus } from "../events/event-bus.ts";
import type { ScenarioName } from "../providers/simulation.ts";
import { searchFlights } from "../search/search-service.ts";
import type { SearchConfig } from "../search/search-types.ts";
import { parseSearchRequest } from "../search/search-validation.ts";

export interface SearchRouteDependencies {
  searchConfig: SearchConfig;
  defaultScenario: ScenarioName;
  eventBus: EventBus;
}

export function createSearchRouter(deps: SearchRouteDependencies): Router {
  const router = Router();

  router.post("/search", async (req, res) => {
    const parsed = parseSearchRequest(req.body, deps.defaultScenario);
    if (!parsed.ok) {
      res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.errors });
      return;
    }
    const response = await searchFlights(parsed.value, { config: deps.searchConfig, eventBus: deps.eventBus });
    res.json(response);
  });

  return router;
}
