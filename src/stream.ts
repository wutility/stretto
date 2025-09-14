import { StrettoStreamableResponse } from "./types";

const ERROR_MSG_BODY_CONSUMED = "Body has already been consumed.";
const ASYNC_ITERATOR = Symbol.asyncIterator;

/**
 * Wraps a Response with a Proxy to make it an AsyncIterable.
 * This is a zero-copy, high-performance path for handling response streams.
 *
 * @template T The type of data in the streamed chunks.
 * @param {Response} response The fetch Response object to wrap.
 * @param {TransformStream<any, any>[]} transformers A list of TransformStreams to pipe the response body through.
 * @param {AbortSignal} [userSignal] An optional user-provided AbortSignal to allow for external cancellation.
 * @returns {StrettoStreamableResponse<T>} A Proxy of the Response that is also an AsyncIterable.
 */
export default function createStreamableResponse<T>(
  response: Response,
  transformers: TransformStream<any, any>[],
  userSignal?: AbortSignal,
): StrettoStreamableResponse<T> {
  if (!response.body) {
    return response as StrettoStreamableResponse<T>;
  }

  let iteratorUsed = false;

  // Pre-compute the final stream source *once* when the proxy is created.
  const finalStreamSource =
    transformers.length > 0
      ? transformers.reduce(
        (readable, transformer) => readable.pipeThrough(transformer),
        response.body,
      )
      : response.body;

  // --- FIX: PERFORMANCE ---
  // The async generator function is now created only *once* and cached.
  // This avoids recreating the function on every access to `Symbol.asyncIterator`.
  const asyncIterator = async function* () {
    if (iteratorUsed) {
      throw new Error(ERROR_MSG_BODY_CONSUMED);
    }
    iteratorUsed = true;
    const reader = finalStreamSource.getReader();

    // Define the abort handler once.
    const onAbort = () => {
      // --- FIX: SILENT ERROR SWALLOWING ---
      // The .catch() now logs unexpected errors instead of silently ignoring them.
      // This is crucial for debugging. A TypeError is often thrown if the stream
      // is already closed or locked, which we can safely ignore.
      reader.cancel(userSignal?.reason).catch((error) => {
        if (error.name !== 'TypeError') {
          console.warn("StrettoStreamableResponse: An unexpected error occurred during stream cancellation.", error);
        }
      });
    };

    // Attach the listener. The { once: true } option ensures it's called at most once.
    userSignal?.addEventListener("abort", onAbort, { once: true });

    try {
      while (true) {
        // This is the hot path. reader.read() returns a promise.
        const { done, value } = await reader.read();
        if (done) return;
        // Yielding the value passes a reference, not a copy.
        yield value;
      }
    } finally {
      // --- FIX: MEMORY LEAK ---
      // This cleanup is critical. We remove the abort listener to prevent a leak
      // in the case where the stream finishes *before* the abort signal is ever fired.
      // It is safe to call removeEventListener even if the listener has already fired.
      userSignal?.removeEventListener("abort", onAbort);
      reader.releaseLock();
    }
  };

  const proxyHandler: ProxyHandler<Response> = {
    get(target, prop) {
      if (prop === ASYNC_ITERATOR) {
        // Return the cached async iterator function.
        return asyncIterator;
      }
      const value = Reflect.get(target, prop);
      // Bind functions to the original response target.
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  };
  return new Proxy(response, proxyHandler) as StrettoStreamableResponse<T>;
}
