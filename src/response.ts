// src/response.ts

import { sseTransformer } from "./transformers/sseTransformer";
import { StrettoOptions, StrettoStreamableResponse } from "./types";

/**
 * Augments a native Response object to make its body async-iterable.
 * This is the core of Stretto's ergonomic API, avoiding wrapper classes.
 */
export default function makeResponseStreamable<T>(
  response: Response,
  options: StrettoOptions<T>,
): StrettoStreamableResponse<T> {
  // Ensures the stream is consumed only once, mimicking native Response behavior.
  let iteratorUsed = false;

  Object.defineProperty(response, Symbol.asyncIterator, {
    value: async function* () {
      if (iteratorUsed) {
        throw new Error(
          "Body has already been consumed. Use response.clone() for multiple iterations.",
        );
      }
      if (!response.body) return;
      iteratorUsed = true;

      if (!options.stream) {
        return response;
      }

      // Streaming: select the correct parser or use a raw stream.
      const parser = options.parser === undefined
        ? sseTransformer<T>({
          strictJson: options.strictJson ?? true,
          includeEventAndId: options.includeEventAndId ?? false,
          minBufferSize: options.minBufferSize ?? 1024,
          maxBufferSize: options.maxBufferSize ?? 1024 * 4,
        })
        : options.parser;

      const stream = parser === null
        ? response.body // Raw byte stream (Uint8Array)
        : response.body.pipeThrough(parser); // Parsed object stream

      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
      } catch (e) {
        if (options.onStreamError) {
          options.onStreamError(e);
        }
        throw e;
      } finally {
        // Crucial for resource cleanup. This prevents memory leaks by ensuring the
        // stream reader lock is always released, even if the consumer loop breaks
        // or throws an error.
        reader.releaseLock();
      }
    },
    writable: false,
    configurable: true,
  });

  return response as StrettoStreamableResponse<T>;
}
