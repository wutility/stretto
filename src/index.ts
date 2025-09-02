import { fetchAndStream } from "./core.ts";
import { DefaultParser } from "./parsers.ts";
import { Opts, Parser } from "./types.ts";

export * from "./types.ts";
export * from "./parsers.ts";
export { defaultBackoff } from "./core.ts";

export interface Stretto<T> {
  [Symbol.asyncIterator](): AsyncIterator<T>;
  cancel(): void;
}

/**
 * a high-performance, resilient streaming request.
 *
 * @param url The URL to fetch.
 * @param init Configuration options for the request.
 * @returns An async iterable stream of parsed data.
 */
export function stretto<T>(url: string | URL, init: Opts<T> = {}): Stretto<T> {
  const ctrl = new AbortController();
  const opts = { ...init, parser: (init.parser ?? DefaultParser<T>()) as Parser<T>, signal: ctrl.signal };
  const iter = fetchAndStream<T>(url, opts);

  return {
    async *[Symbol.asyncIterator]() {
      try {
        for await (const chunk of iter) {
          yield chunk;
        }
      } finally {
        if (!ctrl.signal.aborted) {
          ctrl.abort();
        }
      }
    },
    cancel() {
      ctrl.abort();
    },
  };
}