// index.ts

import { fetchAndParseStream } from "./core";
import { sseParser } from "./parsers";
import { Opts, Parser } from "./types";
// Import anySignal to use it here
import { withRetries, chainParsers, anySignal } from "./utilities";

export { sseParser, ndjsonParser, textParser } from './parsers';

export interface StrettoEvents<T> {
    [Symbol.asyncIterator](): AsyncIterator<T>;
    cancel(): void;
}

export function stretto<T>(
    url: string | URL,
    init: Opts<T> = {}
  ): StrettoEvents<T> {
    const ctrl = new AbortController();
    
    const opts = init;
    
    // FIX: Combine the internal signal with the user-provided one.
    // This is the key change.
    const combinedSignal = anySignal(ctrl.signal, opts.signal);
    
    const parser = (Array.isArray(opts.parser)
      ? chainParsers<T>(opts.parser)
      : opts.parser ?? sseParser) as Parser<T>;
  
    const factory = (signal: AbortSignal) => fetchAndParseStream<T>(url, {
      ...opts,
      parser,
      signal
    });
  
    // Pass the truly combined signal to the retry logic.
    const iter = withRetries<T>({ ...opts, signal: combinedSignal }, factory);

    const api: StrettoEvents<T> = {
        async *[Symbol.asyncIterator]() {
            try {
                for await (const chunk of iter) {
                    yield chunk;
                }
            } finally {
                // Ensure cleanup happens even if the loop is broken by cancellation.
                if (!ctrl.signal.aborted) {
                    ctrl.abort();
                }
            }
        },
        cancel() {
            ctrl.abort();
        },
    };

    return api;
}