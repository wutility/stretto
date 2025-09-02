import { StrettoOpts, StrettoStreamableResponse } from './types';
import { request } from './request';
import { StreamingParser } from './parsers';
import { CancellationTransformer, LineTransformer, ParserTransformer } from './transformers';

export default async function stretto<T = unknown>(url: string | URL, options: StrettoOpts = {}): Promise<StrettoStreamableResponse<T>> {
  const { stream = false, ...opts } = options;
  const response = await request(url, opts);
  let bodyConsumed = false;

  const consumeBody = (): Response => {
    if (bodyConsumed) throw new Error('Response body has already been consumed.');
    bodyConsumed = true;
    return response;
  };

  const streamableResponse: StrettoStreamableResponse<T> = {
    // --- Standard Response Properties ---
    headers: response.headers,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,

    // --- Standard Body-Consuming Methods ---
    get body() {
      return consumeBody().body;
    },
    json: <U = unknown>() => consumeBody().json() as Promise<U>,
    text: () => consumeBody().text(),
    blob: () => consumeBody().blob(),
    arrayBuffer: () => consumeBody().arrayBuffer(),
    formData: () => consumeBody().formData(),

    // --- Async Iterable Implementation ---
    async *[Symbol.asyncIterator]() {
      if (!stream) {
        throw new Error(
          'Cannot iterate on this response. To enable streaming iteration, set the `stream: true` option in your stretto call.'
        );
      }

      const body = consumeBody().body;
      if (!body) return;

      const transformedStream = body
        .pipeThrough(new CancellationTransformer(opts.signal))
        .pipeThrough(new LineTransformer())
        .pipeThrough(new ParserTransformer(new StreamingParser<T>()));

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
    },
  };

  return streamableResponse;
}