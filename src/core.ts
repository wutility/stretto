import addStreamingCapability from "./stream";
import { StrettoOptions, StrettoStreamableResponse } from "./types";
import {
  ABORT_ERROR_NAME,
  calculateBackoff,
  createTimeoutController,
  shouldRetry,
  sleep,
} from "./utilities";

// --- Constants ---
const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const ERROR_MSG_REQUEST_ABORTED = "Request aborted by user";

export default async function stretto<T = unknown>(
  url: string | URL,
  options: StrettoOptions<T> = {},
): Promise<StrettoStreamableResponse<T>> {
  const {
    retries = DEFAULT_RETRIES,
    timeout = DEFAULT_TIMEOUT,
    backoffStrategy = calculateBackoff,
    retryOn = shouldRetry,
    stream = false,
    transformers = [],
    ...fetchOptions
  } = options;

  const userSignal = fetchOptions.signal;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (userSignal?.aborted) {
      throw userSignal.reason ??
        new DOMException(ERROR_MSG_REQUEST_ABORTED, ABORT_ERROR_NAME);
    }

    const { signal, cleanup } = createTimeoutController(timeout, userSignal);
    fetchOptions.signal = signal;

    try {
      if (attempt > 0) {
        await sleep(backoffStrategy(attempt));
      }

      const response = await fetch(url, fetchOptions as RequestInit);

      if (!response.ok) {
        await response.body?.cancel();
        // PERF: Avoid throwing an error if we are going to retry.
        if (attempt < retries && retryOn(undefined, response)) {
          continue; // Continue to the next attempt.
        }
        // This is the final attempt or a non-retryable error, so we throw.
        throw new Error(
          `HTTP Error: ${response.status} ${response.statusText}`,
        );
      }

      // Success Path: The function will return from here. The 'finally' block ensures cleanup.
      if (stream) {
        return addStreamingCapability(response, transformers, userSignal);
      }
      return response as StrettoStreamableResponse<T>;
    } catch (error) {
      // PERF: Avoid re-assigning the error object. Throw it directly.
      if (attempt < retries && retryOn(error, undefined)) {
        continue; // Continue to the next attempt.
      }
      // This is the final attempt or a non-retryable error, so we re-throw.
      throw error;
    } finally {
      // on success (return), failure (throw), or retry (continue).
      cleanup();
    }
  }

  // This code is theoretically unreachable if retries >= 0, but it satisfies
  // TypeScript's control flow analysis.
  throw new Error("Stretto retry loop exited unexpectedly.");
}
