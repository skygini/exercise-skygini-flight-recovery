import type { FlightRecoveryResult } from "../agent/agent-types.ts";
import { logger } from "../logger.ts";

export type RecoveryStatus = "pending" | "running" | "completed" | "failed";

export interface RecoveryRecord {
  searchId: string;
  status: RecoveryStatus;
  createdAt: string;
  updatedAt: string;
  result?: FlightRecoveryResult;
  error?: string;
}

export interface RecoveryStore {
  createPending(searchId: string): RecoveryRecord;
  markRunning(searchId: string): RecoveryRecord;
  markCompleted(searchId: string, result: FlightRecoveryResult): RecoveryRecord;
  markFailed(searchId: string, error: string): RecoveryRecord;
  get(searchId: string): RecoveryRecord | undefined;
}

export function createRecoveryStore(): RecoveryStore {
  const records = new Map<string, RecoveryRecord>();

  function update(searchId: string, changes: Partial<RecoveryRecord> & { status: RecoveryStatus }): RecoveryRecord {
    const current = records.get(searchId);
    if (!current) throw new Error(`No recovery record for search ${searchId}`);
    const next = { ...current, ...changes, updatedAt: new Date().toISOString() };
    records.set(searchId, next);
    logger.info("recovery status changed", { searchId, from: current.status, to: next.status });
    return next;
  }

  return {
    createPending(searchId) {
      const now = new Date().toISOString();
      const record: RecoveryRecord = { searchId, status: "pending", createdAt: now, updatedAt: now };
      records.set(searchId, record);
      logger.info("recovery status changed", { searchId, to: "pending" });
      return record;
    },
    markRunning: (searchId) => update(searchId, { status: "running" }),
    markCompleted: (searchId, result) => update(searchId, { status: "completed", result }),
    markFailed: (searchId, error) => update(searchId, { status: "failed", error }),
    get: (searchId) => records.get(searchId),
  };
}
