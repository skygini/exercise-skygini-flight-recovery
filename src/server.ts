import { createApplication } from "./app.ts";
import { loadConfig } from "./config.ts";
import { logger } from "./logger.ts";

const config = loadConfig();
const { app } = createApplication(config);

const server = app.listen(config.port, () => {
  logger.info("flight search API listening", {
    url: `http://localhost:${config.port}`,
    defaultScenario: config.defaultScenario,
    providerTimeoutMs: config.search.providerTimeoutMs,
    providerCMaxConcurrent: config.search.providerCMaxConcurrent,
    latencyMultiplier: config.search.latencyMultiplier,
  });
});

server.on("error", (error) => {
  logger.error("server failed to start", { error: error.message });
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    logger.info("shutting down", { signal });
    server.close(() => process.exit(0));
  });
}
