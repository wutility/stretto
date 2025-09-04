import { StrettoOpts } from './types';
import { DEFAULT_RETRIES, DEFAULT_TIMEOUT, EXPONENTIAL_BASE, INITIAL_BACKOFF_MS, JITTER_FACTOR, MAX_BACKOFF_MS } from './constants';
import { sleep, isJsonObject } from './utilities';
import { BackoffStrategy, RetryStrategy } from "./types";

export const defaultRetryCondition: RetryStrategy = (res: Response) => res.status >= 500 && res.status < 600;

/**
 * exponential backoff with jitter.
 * Formula: delay = min(MAX, INITIAL * (BASE ^ (attempt-1)))
 * Jitter is applied to spread out retry attempts.
 */
export const defaultBackoff: BackoffStrategy = (attempt) => {
  const exponentialDelay = INITIAL_BACKOFF_MS * Math.pow(EXPONENTIAL_BASE, attempt - 1);
  const cappedDelay = Math.min(MAX_BACKOFF_MS, exponentialDelay);
  return cappedDelay * (1 - JITTER_FACTOR + Math.random() * JITTER_FACTOR);
};

export async function request(url: string | URL, options: StrettoOpts): Promise<Response> {
  const { retries = DEFAULT_RETRIES, timeout = DEFAULT_TIMEOUT, ...rest } = options;
  const { backoffStrategy = defaultBackoff, retryOn = defaultRetryCondition } = rest;

  let lastError: Error | undefined;
  
  const requestHeaders = new Headers(rest.headers);
  if (isJsonObject(rest.body) && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  for (let attempt = 0; attempt < retries + 1; attempt++) {
    if (options.signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');
    
    if (attempt > 0) {
      await sleep(backoffStrategy(attempt), options.signal);
    }
    
    const controller = new AbortController();
    const onAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    
    const timeoutId = timeout > 0 ? setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeout) : 0;

    try {
      const fetchOpts: RequestInit = {
        ...rest,
        headers: requestHeaders,
        body: isJsonObject(rest.body) ? JSON.stringify(rest.body) : (rest.body as BodyInit),
        signal: controller.signal,
      };

      const response = await fetch(url, fetchOpts);

      if (attempt < retries && retryOn(response, options)) {
        // To prevent resource leaks, we must consume or cancel the body before retrying.
        // Cancelling is the most efficient way to discard it without reading the data.
        await response.body?.cancel();
        continue;
      }
      return response;
    } catch (error) {
      lastError = error as Error;
      if (options.signal?.aborted || controller.signal.reason instanceof DOMException) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  throw lastError ?? new Error('Request failed after all retry attempts.');
}