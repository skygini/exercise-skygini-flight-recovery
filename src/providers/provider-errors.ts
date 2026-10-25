import type { ProviderErrorCode, ProviderName } from "../search/search-types.ts";

export class ProviderError extends Error {
  readonly provider: ProviderName;
  readonly code: ProviderErrorCode;

  constructor(provider: ProviderName, code: ProviderErrorCode, message: string) {
    super(`Provider ${provider}: ${message}`);
    this.name = new.target.name;
    this.provider = provider;
    this.code = code;
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(provider: ProviderName, message = "service unavailable (HTTP 503)") {
    super(provider, "unavailable", message);
  }
}

export class ProviderRateLimitError extends ProviderError {
  readonly retryAfterMs: number;

  constructor(provider: ProviderName, message: string, retryAfterMs: number) {
    super(provider, "rate_limited", message);
    this.retryAfterMs = retryAfterMs;
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(provider: ProviderName, timeoutMs: number) {
    super(provider, "timeout", `no response within ${timeoutMs} ms`);
  }
}

export class ProviderInvalidResponseError extends ProviderError {
  constructor(provider: ProviderName, message: string) {
    super(provider, "invalid_response", message);
  }
}
