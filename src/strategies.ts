import { BackoffStrategy, RetryStrategy } from "./types";

export const defaultRetryCondition: RetryStrategy = (res: Response) => res.status >= 500 && res.status < 600;

// Constants for the backoff strategy to improve readability
const INITIAL_BACKOFF_MS = 100;
const MAX_BACKOFF_MS = 5000;
const EXPONENTIAL_BASE = 2;
const JITTER_FACTOR = 0.5;

/**
 * exponential backoff with jitter.
 * Formula: delay = min(MAX, INITIAL * (BASE ^ (attempt-1)))
 * Jitter is applied to spread out retry attempts.
 */
export const defaultBackoff: BackoffStrategy = (attempt) => {
  const exponentialDelay = INITIAL_BACKOFF_MS * Math.pow(EXPONENTIAL_BASE, attempt - 1);
  const cappedDelay = Math.min(MAX_BACKOFF_MS, exponentialDelay);
  // Apply jitter: delay * (1 - JITTER_FACTOR + random() * JITTER_FACTOR)
  // Simplified to: delay * (0.5 + Math.random() * 0.5)
  return cappedDelay * (1 - JITTER_FACTOR + Math.random() * JITTER_FACTOR);
};