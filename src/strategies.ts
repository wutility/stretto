import { BackoffStrategy, RetryStrategy } from "./types";

export const defaultRetryCondition: RetryStrategy = (res) => res.status >= 500 && res.status < 600;

export const defaultBackoff: BackoffStrategy = (attempt) => {
  const delay = Math.min(5000, 100 * Math.pow(2, attempt - 1));
  return delay * (0.5 + Math.random() * 0.5); // Jitter
};