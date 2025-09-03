import { StrettoOpts, StrettoStreamableResponse } from './types';
import { request } from './request';
import { StreamingParser } from './parsers';
import { LineTransformer, ParserTransformer } from './transformers';

export default async function stretto<T = unknown>(url: string | URL, options: StrettoOpts<T> = {}): Promise<StrettoStreamableResponse<T>> {
  const { stream = false, parser = new StreamingParser<T>(), ...opts } = options;
  const response = await request(url, opts);
  let bodyConsumed = false;

  const consumeBody = (): Response => {
    if (bodyConsumed) throw new Error('Response body has already been consumed.');
    bodyConsumed = true;
    return response;
  };

  const streamableResponse: StrettoStreamableResponse<T> = {
    headers: response.headers,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    get body() {
      return consumeBody().body;
    },
    json: <U = unknown>() => consumeBody().json() as Promise<U>,
    text: () => consumeBody().text(),
    blob: () => consumeBody().blob(),
    arrayBuffer: () => consumeBody().arrayBuffer(),
    formData: () => consumeBody().formData(),

    async *[Symbol.asyncIterator](): AsyncGenerator<string | T, void, undefined> {
      if (!stream) {
        throw new Error(
          'Cannot iterate on this response. To enable streaming iteration, set `stream: true` in your stretto call.'
        );
      }

      const body = consumeBody().body;
      if (!body) return;

      if (opts.signal?.aborted) {
        throw new DOMException('Operation aborted', 'AbortError');
      }

      const transformedStream = body
        .pipeThrough(new LineTransformer())
        .pipeThrough(new ParserTransformer(parser));

      const reader = transformedStream.getReader();

      const abortHandler = () => {
        reader.cancel(new DOMException('Operation aborted', 'AbortError')).catch(() => {});
      };
      opts.signal?.addEventListener('abort', abortHandler);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value as string | T;
        }
      } finally {
        opts.signal?.removeEventListener('abort', abortHandler);
        reader.releaseLock();
      }
    },
  };

  return streamableResponse;
}