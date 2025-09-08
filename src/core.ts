// src/core.ts
import { HTTPError } from "./errors";
import { StrettoOptions, StrettoStreamableResponse } from "./types";
import { calculateBackoff, createTimeoutController, shouldRetry, sleep } from './utilities';

const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT = 30000;

const addStreamingCapability = <T>(response: Response, stream: boolean, transformers: TransformStream<any, any>[] = [], userSignal?: AbortSignal): StrettoStreamableResponse<T> => {
  if (!stream) return response as StrettoStreamableResponse<T>;

  let iteratorUsed = false;

  const proxyHandler: ProxyHandler<Response> = {
    get(target, prop, receiver) {
      if (prop === Symbol.asyncIterator) {
        return async function* () {
          if (iteratorUsed) throw new Error("Body has already been consumed.");
          const body = target.body;
          if (!body) return;
          iteratorUsed = true;

          let streamPipe: ReadableStream = body;
          for (const transformer of transformers) {
            streamPipe = streamPipe.pipeThrough(transformer);
          }
          const reader = streamPipe.getReader();

          // Ensure the user's signal can cancel the reader
          const onAbort = () => reader.cancel(userSignal?.reason);
          userSignal?.addEventListener("abort", onAbort);

          try {
            while (true) {
              // Check if the signal was aborted before reading
              if (userSignal?.aborted) {
                throw userSignal.reason ??
                new DOMException("Request aborted by user", "AbortError");
              }
              const { done, value } = await reader.read();
              if (done) break;
              yield value;
            }
          } finally {
            userSignal?.removeEventListener("abort", onAbort);
            reader.releaseLock();
          }
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  };

  return new Proxy(response, proxyHandler) as StrettoStreamableResponse<T>;
};

export default async function stretto<T = unknown>(url: string | URL, options: StrettoOptions<T> = {},): Promise<StrettoStreamableResponse<T>> {
  const {
    retries = DEFAULT_RETRIES,
    timeout = DEFAULT_TIMEOUT,
    backoffStrategy = calculateBackoff,
    retryOn = shouldRetry,
    stream = false,
    transformers = [],
    signal: userSignal,
    ...fetchOptions
  } = options;

  let lastError: Error = new Error(`Request failed after ${retries + 1} attempts`,);

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (userSignal?.aborted) {
      throw userSignal.reason ??
      new DOMException("Request aborted by user", "AbortError");
    }

    const { signal, cleanup } = createTimeoutController(timeout, userSignal);

    try {
      const response = await fetch(url, { ...fetchOptions, signal });
      if (!response.ok) throw new HTTPError(`HTTP ${response.status}: ${response.statusText}`, response,);

      // Success: clean up and return the streamable response
      cleanup();
      return addStreamingCapability(response, stream, transformers, userSignal);
    } catch (error) {
      // This block now catches both network errors and HTTP errors thrown above
      lastError = error as Error;
      const response = error instanceof HTTPError ? error.response : undefined;

      // Immediately throw if the user aborted or if the error is not retryable
      if (!retryOn(error, response) || attempt === retries) {
        cleanup();
        throw lastError;
      }
    }

    // If we are here, it means a retry is happening.
    // Cleanup the current attempt's controller before sleeping.
    cleanup();
    await sleep(backoffStrategy(attempt));
  }

  throw lastError; // Should be unreachable but acts as a fallback
}
