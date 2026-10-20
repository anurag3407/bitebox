export interface FetchWithTimeoutInit extends RequestInit {
  timeoutMs?: number;
}

/**
 * fetch with a hard deadline. Every outbound provider call goes through this so a
 * slow third party cannot hold request threads or worker leases indefinitely.
 */
export async function fetchWithTimeout(url: string, init: FetchWithTimeoutInit = {}): Promise<Response> {
  const { timeoutMs = 8000, ...rest } = init;
  return fetch(url, { ...rest, signal: rest.signal ?? AbortSignal.timeout(timeoutMs) });
}

/** Error from a provider whose outcome is unknown (timeout / network): callers must reconcile, not assume failure. */
export class ProviderUnavailableError extends Error {
  constructor(provider: string, cause: unknown) {
    super(`${provider} unavailable: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = "ProviderUnavailableError";
  }
}

/** Error with a definite provider rejection (4xx). Safe to treat as a final failure. */
export class ProviderRejectedError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(provider: string, status: number, body: string) {
    super(`${provider} rejected request with status ${status}`);
    this.name = "ProviderRejectedError";
    this.status = status;
    this.body = body.slice(0, 1000);
  }
}
