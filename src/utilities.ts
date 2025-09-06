// src/utilities.ts
import { BackoffStrategy, RetryStrategy } from "./types";

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Constants for the backoff strategy to improve readability
const INITIAL_BACKOFF_MS = 100;
const MAX_BACKOFF_MS = 5000;
const EXPONENTIAL_BASE = 2;
const JITTER_FACTOR = 0.5; // Apply up to 50% jitter

/**
 * Default backoff strategy: exponential delay with full jitter.
 * This is a robust strategy to prevent thundering herd problems.
 */
export const DEFAULT_BACKOFF: BackoffStrategy = (attempt) => {
  const exponentialDelay = INITIAL_BACKOFF_MS *
    Math.pow(EXPONENTIAL_BASE, attempt);
  const cappedDelay = Math.min(MAX_BACKOFF_MS, exponentialDelay);
  // Apply jitter: delay * (1 - JITTER_FACTOR + random() * JITTER_FACTOR)
  const jitter = cappedDelay *
    (1 - JITTER_FACTOR + Math.random() * JITTER_FACTOR);
  return jitter;
};

/**
 * Default retry strategy: retry only on 5xx server errors.
 */
export const DEFAULT_RETRY_ON: RetryStrategy = (res) =>
  res.status >= 500 && res.status < 600;

/**
 * Creates a combined AbortSignal for user-cancellation and timeouts.
 * Uses the modern `AbortSignal.any` for optimized, native handling.
 */
export function createTimeoutSignal(userSignal?: AbortSignal, timeout: number = 0,): AbortSignal {
  if (timeout <= 0) return userSignal ?? new AbortController().signal;

  const timeoutSignal = AbortSignal.timeout(timeout);
  if (!userSignal) return timeoutSignal

  // @ts-ignore
  return AbortSignal.any([userSignal, timeoutSignal]);
}
