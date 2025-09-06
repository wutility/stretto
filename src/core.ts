// src/core.ts
import { DEFAULT_RETRIES, DEFAULT_TIMEOUT } from "./constants";
import { HTTPError } from "./errors";
import makeResponseStreamable from "./response";
import { StrettoOptions, StrettoStreamableResponse } from "./types";
import {
  createTimeoutSignal,
  DEFAULT_BACKOFF,
  DEFAULT_RETRY_ON,
  sleep,
} from "./utilities";

/**
 * An enhanced fetch client with retries, timeouts, and high-performance streaming.
 *
 * @template T The expected type of the response body or streamed chunks.
 * @param url The URL to fetch.
 * @param options Configuration for the request, including retries, timeout, and streaming.
 * @returns A promise that resolves to a Response object which is also an async iterable.
 *
 * @example
 * // Simple JSON GET
 * const user = await stretto('https://api.example.com/user/1').then(res => res.json());
 * // Simple arrayBuffer GET
 * const user = await stretto('https://api.example.com/user/1').then(res => res.arrayBuffer());
 *
 * // Streaming Server-Sent Events
 * const stream = await stretto('https://api.example.com/events', { stream: true });
 * for await (const event of stream) {
 *   console.log(event);
 * }
 */
export default async function stretto<T = unknown>(url: string | URL, options: StrettoOptions<T> = {},): Promise<StrettoStreamableResponse<T>> {
  const {
    retries = DEFAULT_RETRIES,
    timeout = DEFAULT_TIMEOUT,
    backoffStrategy = DEFAULT_BACKOFF,
    retryOn = DEFAULT_RETRY_ON,
    stream = false,
    strictJson = true,
    minBufferSize = 1024,
    maxBufferSize = 8 * 1024,
    parser,
    signal: userSignal,
    ...fetchInit
  } = options;

  if (retries < 0 || timeout < 0) {
    throw new RangeError("Retries and timeout must be non-negative.");
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const signal = createTimeoutSignal(userSignal, timeout);

    if (signal.aborted) {
      // Fail fast if the signal is already aborted.
      throw signal.reason ??
      new DOMException("Request aborted before fetch", "AbortError");
    }

    try {
      const res = await fetch(url, { ...fetchInit, signal });
      if (res.ok) return makeResponseStreamable(res, { stream, strictJson, parser });

      lastError = new HTTPError(`Request failed with status ${res.status}: ${res.statusText}`, res,);

      if (!retryOn(res)) {
        // If the custom retry strategy returns false, fail immediately.
        throw lastError;
      }
    } catch (error) {
      lastError = error as Error;

      // Do not retry on user cancellation or timeouts; these are terminal.
      if (
        error instanceof DOMException &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw lastError;
      }
    }

    // If this was the last attempt, break the loop to throw the error.
    if (attempt >= retries) {
      break;
    }

    // Wait before the next attempt.
    if (attempt < retries && !signal.aborted) {
      await sleep(backoffStrategy(attempt));
    }
  }

  // Simpler and more robust final throw
  throw lastError ?? new Error(`Request failed after ${retries + 1} attempts.`);
}
