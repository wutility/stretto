import { StrettoOpts } from './types';
import { DEFAULT_RETRIES, DEFAULT_TIMEOUT } from './constants';
import { sleep, isJsonObject } from './utilities';
import { defaultBackoff, defaultRetryCondition } from './strategies';

export async function request(url: string | URL, options: StrettoOpts): Promise<Response> {
  const {
    body,
    headers = {},
    retries = DEFAULT_RETRIES,
    timeout = DEFAULT_TIMEOUT,
    backoffStrategy = defaultBackoff,
    retryOn = defaultRetryCondition,
    signal,
    ...fetchOptions
  } = options;

  let lastError: Error | undefined;
  let lastResponse: Response | undefined;

  // `retries` means the number of additional attempts. So `retries + 1` total attempts.
  for (let attempt = 0; attempt < retries + 1; attempt++) {
    // If the external signal is already aborted, we can stop immediately.
    if (signal?.aborted) {
      throw new DOMException('Operation aborted', 'AbortError');
    }

    const controller = new AbortController();
    const internalSignal = controller.signal;

    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });

    const timeoutId = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeout);

    try {
      if (attempt > 0) {
        await sleep(backoffStrategy(attempt), internalSignal);
      }

      const requestHeaders = new Headers(headers);
      const fetchOpts: RequestInit = { ...fetchOptions, headers: requestHeaders, signal: internalSignal };

      if (isJsonObject(body)) {
        requestHeaders.set('Content-Type', 'application/json');
        fetchOpts.body = JSON.stringify(body);
      } else {
        fetchOpts.body = body as BodyInit;
      }      

      const response = await fetch(url, fetchOpts);
      lastResponse = response;

      // Don't retry on the last attempt
      if (attempt < retries && retryOn(response, attempt)) {
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      // If user aborted, throw immediately without further retries.
      if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');
      // If the error was due to our internal signal (e.g., timeout), re-throw.
      if (internalSignal.aborted) {
        if (controller.signal.reason instanceof DOMException) {
          throw controller.signal.reason;
        }
        throw lastError;
      }
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  if (lastResponse) {
    throw new Error(`Request failed after all retry attempts. Last response status: ${lastResponse.status}`);
  }

  throw lastError ?? new Error('Request failed after all retry attempts.');
}