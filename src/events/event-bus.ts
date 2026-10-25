import { logger } from "../logger.ts";
import type { SearchCompletedEvent } from "./search-completed.ts";

export type DomainEvent = SearchCompletedEvent;
export type EventType = DomainEvent["type"];
export type EventHandler<T extends EventType> = (event: Extract<DomainEvent, { type: T }>) => void | Promise<void>;

export interface EventBus {
  /** Returns an unsubscribe function. */
  subscribe<T extends EventType>(type: T, handler: EventHandler<T>): () => void;
  /** Never blocks the publisher: handlers run on a later event-loop turn. */
  publish(event: DomainEvent): void;
  /** Resolves once every dispatched handler has settled (useful in tests and scripts). */
  waitForIdle(): Promise<void>;
}

type AnyHandler = (event: DomainEvent) => void | Promise<void>;

export function createEventBus(): EventBus {
  const handlers = new Map<EventType, Set<AnyHandler>>();
  const inFlight = new Set<Promise<void>>();

  function dispatch(event: DomainEvent, handler: AnyHandler): void {
    const task = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => handler(event))
      .catch((error: unknown) => {
        logger.error("event handler failed", {
          type: event.type,
          eventId: event.eventId,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => inFlight.delete(task));
    inFlight.add(task);
  }

  return {
    subscribe(type, handler) {
      const registered = handlers.get(type) ?? new Set<AnyHandler>();
      const anyHandler = handler as unknown as AnyHandler;
      registered.add(anyHandler);
      handlers.set(type, registered);
      return () => registered.delete(anyHandler);
    },

    publish(event) {
      const registered = handlers.get(event.type) ?? new Set();
      logger.info("event published", { type: event.type, eventId: event.eventId, searchId: event.searchId, consumers: registered.size });
      for (const handler of registered) dispatch(event, handler);
    },

    async waitForIdle() {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    },
  };
}
