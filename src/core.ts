import { StrettoOpts, StrettoStreamableResponse } from './types';
import { request } from './request';
import { SseParser } from './parsers';
import { CancellationTransformer, LineTransformer, ParserTransformer } from './transformers';

/**
 * A lightweight and powerful fetch wrapper with first-class support for streaming (SSE),
 * featuring retries, timeouts, and cancellation.
 * * @param url The URL to fetch.
 * @param options Configuration options for the request.
 * @returns A Proxy around the native Response object that adds async iterable capabilities.
 * * @example
 * // Simple JSON GET request
 * const { user } = await stretto('https://api.example.com/user/1').then(res => res.json());
 * * @example
 * // Streaming an SSE endpoint
 * const response = await stretto('https://api.example.com/events', { stream: true });
 * for await (const event of response) {
 * console.log(event);
 * }
 * * @throws {Error} Throws an error if the body is consumed multiple times. This matches the
 * behavior of the native Fetch API's Response object.
 * @throws {Error} Attempting to iterate (`for await...of`) on a response where the `stream`
 * option was not set to `true` will throw an error.
 */
export default async function stretto<T = unknown>(
  url: string | URL,
  options: StrettoOpts<T> = {}
): Promise<StrettoStreamableResponse<T>> {
  const { stream = false, parser, strictJson = true, ...opts } = options;
  const response = await request(url, opts);

  // For non-streaming requests, fail fast on non-ok responses.
  if (!stream && !response.ok) {
    // Attempt to get a more detailed error message from the body.
    const bodyText = await response.text().catch(() => '');
    throw new Error(`Request failed: ${response.status} ${response.statusText}. Body: ${bodyText}`);
  }

  let bodyConsumed = false;
  const consumeBody = () => {
    if (bodyConsumed) throw new Error('Response body has already been consumed.');
    bodyConsumed = true;
  };

  // Use a Proxy to wrap the response. This is more robust than copying properties.
  // It forwards all property access to the original response, except for the
  // body-consuming methods and the async iterator, which we override.
  return new Proxy(response, {
    get(target, prop, receiver) {
      if (prop === Symbol.asyncIterator) {
        return async function* () {
          if (!stream) throw new Error('Streaming not enabled. Use { stream: true } in options.');
          consumeBody();
          const body = target.body;
          if (!body) return;

          const streamParser = parser ?? new SseParser<T>({ strict: strictJson });
          const transformedStream = body
            .pipeThrough(new CancellationTransformer(opts.signal))
            .pipeThrough(new LineTransformer())
            .pipeThrough(new ParserTransformer(streamParser));

          const reader = transformedStream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              yield value;
            }
          } finally {
            reader.releaseLock();
          }
        };
      }

      // Intercept body-consuming properties
      if (['body', 'json', 'text', 'blob', 'arrayBuffer', 'formData'].includes(prop as string)) {
        consumeBody();
        const value = Reflect.get(target, prop, receiver);
        // If the property is a function (like .json()), bind it to the target
        return typeof value === 'function' ? value.bind(target) : value;
      }
      
      // For all other properties (e.g., .status, .ok, .headers),
      // just forward them to the original response object.
      return Reflect.get(target, prop, receiver);
    },
  }) as StrettoStreamableResponse<T>;
}