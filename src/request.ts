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

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const internalSignal = controller.signal;

    const onAbort = () => controller.abort(signal?.reason ?? undefined);
    signal?.addEventListener?.('abort', onAbort);

    const timeoutId = timeout > 0 ?
      setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeout) : undefined;

    try {
      if (attempt > 0) await sleep(backoffStrategy(attempt));

      const requestHeaders = new Headers(headers);
      const fetchOpts: RequestInit = { ...fetchOptions, headers: requestHeaders, signal: internalSignal };

      if (isJsonObject(body)) {
        if (!requestHeaders.has('Content-Type')) {
          requestHeaders.set('Content-Type', 'application/json');
        }
        fetchOpts.body = JSON.stringify(body);
      } else if (body !== undefined) {
        fetchOpts.body = body as BodyInit;
      }

      const response = await fetch(url, fetchOpts);

      if (attempt < retries && retryOn(response.clone())) {
        await response.body?.cancel?.();
        continue;
      }

      return response;
    } catch (error: any) {
      lastError = error;
      // Only throw for abort errors (including timeouts)
      if (internalSignal.aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') throw lastError;
      // Otherwise, will retry
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      signal?.removeEventListener?.('abort', onAbort);
    }
  }

  throw new Error('Request failed after all retry attempts.', { cause: lastError });
}