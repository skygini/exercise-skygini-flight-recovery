import type { ProviderQueryResult, ProviderResults } from "../../search/search-types.ts";

/** Thrown when a tool is called with input the traveller's preferences do not allow. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

/** Thrown when a tool search could not run: every provider failed. */
export class ToolExecutionError extends Error {
  readonly providerResults: ProviderResults;

  constructor(message: string, providerResults: ProviderResults) {
    super(message);
    this.name = "ToolExecutionError";
    this.providerResults = providerResults;
  }
}

/** A search where no provider answered is an error, not an empty result. */
export function requireAnyProviderSuccess(result: ProviderQueryResult): ProviderQueryResult {
  const failures: string[] = [];
  for (const [provider, outcome] of Object.entries(result.providerResults)) {
    if (outcome.status === "success") return result;
    failures.push(`${provider}: ${outcome.error.code}`);
  }
  throw new ToolExecutionError(`all providers failed (${failures.join(", ")})`, result.providerResults);
}
