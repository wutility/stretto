import { DEFAULT_RETRIES, DEFAULT_TIMEOUT } from "./constants";
import makeResponseStreamable from "./response";
import { StrettoOptions, StrettoStreamableResponse } from "./types";
import { DEFAULT_BACKOFF, DEFAULT_RETRY_ON, createTimeoutSignal, sleep } from "./utilities";

/**
 * An error representing a non-successful HTTP response. It includes the response object for further inspection.
 */
export class HTTPError extends Error {
  public readonly response: Response;

  constructor(message: string, response: Response) {
    super(message);
    this.name = "HTTPError";
    this.response = response;
  }
}

/**
 * An enhanced fetch client with retries, timeouts, and high-performance streaming.
 */
export default async function stretto<T = unknown>(url: string | URL, options: StrettoOptions<T> = {},): Promise<StrettoStreamableResponse<T>> {
  const {
    retries = DEFAULT_RETRIES,
    timeout = DEFAULT_TIMEOUT,
    backoffStrategy = DEFAULT_BACKOFF,
    retryOn = DEFAULT_RETRY_ON,
    stream = false,
    strictJson = true,
    parser,
    signal: userSignal,
    ...fetchInit
  } = options;

  if (retries < 0 || timeout < 0) {
    throw new RangeError("Retries and timeout must be non-negative.");
  }

  let attempt = 0;
  let lastError: Error | undefined;

  while (attempt <= retries) {
    const signal = createTimeoutSignal(userSignal, timeout);

    // Fast check for immediate abortion before fetching to avoid unnecessary network requests.
    if (signal.aborted) {
      throw signal.reason ?? new DOMException('Request aborted', 'AbortError');
    }

    try {
      const res = await fetch(url, { ...fetchInit, signal });

      if (res.ok) {
        return makeResponseStreamable(res, { stream, strictJson, parser });
      }

      const httpError = new HTTPError(`Request failed with status ${res.status}: ${res.statusText}`, res,);

      if (attempt >= retries || !retryOn(res)) {
        throw httpError;
      }
      lastError = httpError;

    } catch (error) {
      lastError = error as Error;

      // Do not retry on client-side errors like abort/timeout or unrecoverable network issues.
      if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw error;
      }
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw error;
      }

      if (attempt >= retries) {
        break; // Exit loop to throw the final captured error.
      }
    }

    attempt++;
    if (attempt <= retries) {
      await sleep(backoffStrategy(attempt - 1));
    }
  }

  // After all retries, throw the last captured error to preserve its original type and context.
  throw lastError ?? new DOMException(`Request failed after ${retries + 1} attempts.`, 'AbortError');
}