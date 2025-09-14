const INITIAL_BACKOFF_MS = 100;
const MAX_BACKOFF_MS = 5000;

export const ABORT_ERROR_NAME = "AbortError";
export const TIMEOUT_ERROR_NAME = "TimeoutError";
const TIMEOUT_ERROR_MSG = "Connection timeout";

// PERF: Precomputed Set for O(1) status code lookups during retry checks.
const RETRY_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/** A simple promise-based sleep function. */
export const sleep = (ms: number, signal?: AbortSignal): Promise<void> => {
  return new Promise((resolve, reject) => {
    // If already aborted, reject immediately
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Sleep aborted', 'AbortError'));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    // If signal is provided, set up abort listener
    if (signal) {
      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(signal.reason ?? new DOMException('Sleep aborted', 'AbortError'));
      };

      signal.addEventListener('abort', abortHandler, { once: true });
    }
  });
};

/**
 * Calculates exponential backoff with full jitter.
 * This strategy prevents the "thundering herd" problem under high contention.
 * @param attempt The current retry attempt number (1-based).
 */
export const calculateBackoff = (attempt: number): number => {
  // PERF: Use bitwise shift for fast power-of-2 calculation.
  const exponentialDelay = INITIAL_BACKOFF_MS << (attempt - 1);
  // Full jitter is a random value between 0 and the exponential delay.
  const jitter = exponentialDelay * Math.random();
  return Math.min(MAX_BACKOFF_MS, jitter);
};

/**
 * Default logic to determine if a request should be retried.
 */
export const shouldRetry = (error: unknown, response?: Response): boolean => {
  // Never retry on user-initiated aborts.
  if (error instanceof DOMException && error.name === ABORT_ERROR_NAME) {
    return false;
  }

  // Retry on specific server status codes.
  if (response && RETRY_STATUS_CODES.has(response.status)) {
    return true;
  }

  // Retry on specific transient network errors.
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return true;
  }

  // Explicitly do not retry on any other errors (e.g., programming errors).
  return false;
};

/**
 * Creates a linked AbortSignal that aborts on a timeout or when a user-provided signal aborts.
 * PERF: This function is meticulously optimized to create the absolute minimum number of closures.
 * The `cleanup` function is the single source of truth for removing the event listener,
 * simplifying logic and preventing memory leaks in all code paths.
 */
export const createTimeoutController = (timeoutMs: number, userSignal?: AbortSignal,): { signal: AbortSignal; timeoutId?: ReturnType<typeof setTimeout>; cleanup: () => void; } => {
  const controller = new AbortController();

  if (userSignal?.aborted) {
    controller.abort(userSignal.reason);
    return { signal: controller.signal, cleanup: () => { } };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  // PERF: Define the listener once. It will be wrapped in the final cleanup closure.
  const onUserAbort = () => {
    if (timeoutId) clearTimeout(timeoutId);
    controller.abort(userSignal?.reason);
  };

  if (timeoutMs > 0 && timeoutMs !== Infinity) {
    timeoutId = setTimeout(() => {
      // The timeout's only job is to abort. Cleanup is handled by the caller's `finally` block.
      controller.abort(new DOMException(TIMEOUT_ERROR_MSG, TIMEOUT_ERROR_NAME));
    }, timeoutMs);
  }

  if (userSignal) {
    userSignal.addEventListener("abort", onUserAbort, { once: true });
  }

  // The cleanup function is the single source of truth for removing the listener and clearing the timeout.
  // This is the only new closure created and returned by this function.
  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    userSignal?.removeEventListener("abort", onUserAbort);
  };

  return { signal: controller.signal, timeoutId, cleanup };
};
