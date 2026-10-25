import express, { type ErrorRequestHandler, type Express } from "express";
import { createRecoveryRouter } from "./api/recovery-routes.ts";
import { createSearchRouter } from "./api/search-routes.ts";
import type { AppConfig } from "./config.ts";
import { createEventBus, type EventBus } from "./events/event-bus.ts";
import { logger } from "./logger.ts";
import { SCENARIO_NAMES } from "./providers/simulation.ts";
import { createRecoveryStore, type RecoveryStore } from "./storage/recovery-store.ts";
import { registerRecoveryWorker } from "./worker/recovery-worker.ts";

export interface Application {
  app: Express;
  eventBus: EventBus;
  recoveryStore: RecoveryStore;
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ error: "INVALID_JSON", message: "Request body is not valid JSON" });
    return;
  }
  logger.error("unhandled request error", { error: error instanceof Error ? error.stack : String(error) });
  res.status(500).json({ error: "INTERNAL_ERROR" });
};

export function createApplication(config: AppConfig): Application {
  const eventBus = createEventBus();
  const recoveryStore = createRecoveryStore();
  registerRecoveryWorker(eventBus, { recoveryStore, searchConfig: config.search });

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", scenarios: SCENARIO_NAMES, defaultScenario: config.defaultScenario });
  });
  app.use(createSearchRouter({ searchConfig: config.search, defaultScenario: config.defaultScenario, eventBus }));
  app.use(createRecoveryRouter(recoveryStore));
  app.use((_req, res) => {
    res.status(404).json({ error: "NOT_FOUND" });
  });
  app.use(errorHandler);

  return { app, eventBus, recoveryStore };
}
