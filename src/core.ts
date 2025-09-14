import createStreamableResponse from "./stream";
import {
  HTTPError,
  StrettoOptions,
  StrettoStreamableResponse,
} from "./types";
import {
  ABORT_ERROR_NAME,
  calculateBackoff,
  createTimeoutController,
  shouldRetry,
  sleep,
} from "./utilities";

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const ERROR_MSG_REQUEST_ABORTED = "Request aborted by user";

/**
 * A robust fetch wrapper with built-in retry, backoff, and streaming capabilities.
 *
 * @template T The expected type of the response data.
 * @param {string | URL} url The URL to fetch.
 * @param {StrettoOptions<T>} [options] The options object for configuring the fetch request.
 * @returns {Promise<StrettoStreamableResponse<T>>} A promise that resolves to a StrettoStreamableResponse.
 */
export default async function stretto<T = unknown>(
  url: string | URL,
  options: StrettoOptions = {}
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
    // Check for user-initiated abort before each attempt and throw.
    if (userSignal?.aborted) {
      throw userSignal.reason ??
      new DOMException(ERROR_MSG_REQUEST_ABORTED, ABORT_ERROR_NAME);
    }

    const { signal, cleanup } = createTimeoutController(timeout, userSignal);

    // Clone fetch options to avoid mutation
    const fetchInit: RequestInit = {
      ...fetchOptions,
      signal,
    };

    try {
      if (attempt > 0) {
        await sleep(backoffStrategy(attempt), signal); // Pass signal for cancellation
      }

      const response = await fetch(url, fetchInit);

      if (response.ok) {
        if (stream) {
          return createStreamableResponse(response, transformers, userSignal);
        }
        return response as StrettoStreamableResponse<T>;
      } else {
        // If the response is not ok, cancel the body to free resources.
        await response.body?.cancel();

        if (attempt < retries && retryOn(undefined, response)) {
          continue; // Continue to the next attempt.
        }
        // This is the final attempt or a non-retryable error, so we throw a typed error.
        throw new HTTPError(response);
      }
    } catch (error) {
      if (attempt < retries && retryOn(error, undefined)) {
        continue; // Continue to the next attempt.
      }
      // This is the final attempt, a non-retryable error, or an abort, so we re-throw.
      throw error;
    } finally {
      // Cleanup will run on success (return), failure (throw), or retry (continue).
      cleanup();
    }
  }

  // This is a safety net and should be unreachable if retries >= 0.
  throw new Error("Stretto retry loop exited unexpectedly.");
}