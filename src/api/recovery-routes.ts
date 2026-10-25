import { Router } from "express";
import type { RecoveryStore } from "../storage/recovery-store.ts";

export function createRecoveryRouter(recoveryStore: RecoveryStore): Router {
  const router = Router();

  router.get("/searches/:searchId/recovery", (req, res) => {
    const record = recoveryStore.get(req.params.searchId);
    if (!record) {
      res.status(404).json({ error: "NOT_FOUND", message: `No recovery for search ${req.params.searchId}` });
      return;
    }
    res.json(record);
  });

  return router;
}
