import { BackoffStrategy, RetryStrategy } from "./types";

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));


// Constants for the backoff strategy to improve readability
const INITIAL_BACKOFF_MS = 100;
const MAX_BACKOFF_MS = 5000;
const EXPONENTIAL_BASE = 2;
const JITTER_FACTOR = 0.5;

export const DEFAULT_BACKOFF: BackoffStrategy = (attempt) => {
  const exponentialDelay = INITIAL_BACKOFF_MS * Math.pow(EXPONENTIAL_BASE, attempt - 1);
  const cappedDelay = Math.min(MAX_BACKOFF_MS, exponentialDelay);
  // Apply jitter: delay * (1 - JITTER_FACTOR + random() * JITTER_FACTOR)
  // Simplified to: delay * (0.5 + Math.random() * 0.5)
  return cappedDelay * (1 - JITTER_FACTOR + Math.random() * JITTER_FACTOR);
};

export const DEFAULT_RETRY_ON: RetryStrategy = (res) => res.status >= 500 && res.status < 600; // Retry on 5xx server errors

/**
 * Creates a combined AbortSignal for user-cancellation and timeouts.
 * Uses the modern `AbortSignal.any` for optimized, native handling.
 */
export function createTimeoutSignal(userSignal?: AbortSignal, timeout: number = 0): AbortSignal {
  if (timeout <= 0) {
    // If no timeout, return the user's signal or a dummy one that never aborts.
    return userSignal ?? new AbortController().signal;
  }
  const timeoutSignal = AbortSignal.timeout(timeout);
  // `AbortSignal.any` is highly optimized for this exact use case.
  return userSignal
    // @ts-ignore: Unreachable code error
    ? AbortSignal.any([userSignal, timeoutSignal])
    : timeoutSignal;
}
