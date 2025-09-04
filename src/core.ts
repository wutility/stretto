import { StrettoOpts, StrettoStreamableResponse } from './types';
import { request } from './request';
import { SseParser } from './parsers';
import { CancellationTransformer, LineTransformer, ParserTransformer } from './transformers';

export default async function stretto<T = unknown>(url: string | URL, options: StrettoOpts<T> = {}): Promise<StrettoStreamableResponse<T>> {
  const { stream = false, parser, strictJson = true, ...opts } = options;
  const response = await request(url, opts);

  if (!stream && !response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

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

    async *[Symbol.asyncIterator]() {
      if (!stream) throw new Error("Streaming not enabled. Use { stream: true } in options.");

      const body = consumeBody().body;
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
          if (value !== undefined) yield value;
        }
      } finally {
        reader.releaseLock();
      }
    }

  };

  return streamableResponse;
}
