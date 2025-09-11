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
export default function createStreamableResponse<T>(response: Response, transformers: TransformStream<any, any>[], userSignal?: AbortSignal,): StrettoStreamableResponse<T> {
  if (!response.body) {
    return response as StrettoStreamableResponse<T>;
  }

  let iteratorUsed = false;
  // PERF: Using a plain object is slightly faster than a Map for a small, fixed
  // set of known string keys due to V8's hidden classes (shape optimization).
  const functionCache: Record<PropertyKey, Function> = {};

  // PERF: Pre-compute the final stream source *once* when the proxy is created.
  const finalStreamSource = transformers.length > 0
    ? transformers.reduce(
      (readable, transformer) => readable.pipeThrough(transformer),
      response.body,
    )
    : response.body;

  const proxyHandler: ProxyHandler<Response> = {
    get(target, prop) {
      if (prop === ASYNC_ITERATOR) {
        return async function* () {
          if (iteratorUsed) throw new Error(ERROR_MSG_BODY_CONSUMED);
          iteratorUsed = true;
          const reader = finalStreamSource.getReader();

          // If a user signal is provided, its "abort" event will cause the
          // reader.read() promise to reject, which is caught by the finally block.
          const onAbort = () => {
            // The .catch() is important because cancel() can throw if the stream
            // is already closed, which we don't want to be an unhandled rejection.
            reader.cancel(userSignal?.reason).catch(() => { });
          };
          userSignal?.addEventListener("abort", onAbort, { once: true });

          try {
            while (true) {
              // This is the hot path. reader.read() returns a promise that resolves
              // with an object { done, value }. The allocation of this object is
              // an irreducible overhead from the underlying Web Streams API.
              const { done, value } = await reader.read();
              if (done) return;
              // Yielding the value passes a reference, not a copy. This maintains
              // the zero-copy nature of the stream.
              yield value;
            }
          } finally {
            // This is critical for preventing resource leaks.
            userSignal?.removeEventListener("abort", onAbort);
            reader.releaseLock();
          }
        };
      }
      const value = Reflect.get(target, prop);
      if (typeof value === "function") {
        // PERF: Cache bound functions to avoid re-binding on every call.
        if (!functionCache[prop as string]) {
          functionCache[prop as string] = value.bind(target);
        }
        return functionCache[prop as string];
      }
      return value;
    },
  };
  return new Proxy(response, proxyHandler) as StrettoStreamableResponse<T>;
}
