// core.ts

import { DEFAULT_BUFFER_SIZE, DEFAULT_RETRIES, DEFAULT_TIMEOUT, NEWLINE, CARRIAGE_RETURN } from "./constants.ts";
import { Opts, Parser, Next, BackoffStrategy } from "./types.ts";
import { sleep } from "./utilities.ts";

/**
 * A high-performance line processor using a ring buffer to avoid memory reallocation.
 */
class LineProcessor {
  private buffer: Uint8Array;
  private writePos = 0;
  private readPos = 0;

  constructor(bufferSize: number) { this.buffer = new Uint8Array(bufferSize); }

  push(chunk: Uint8Array): Uint8Array[] {
    // Grow buffer if chunk doesn't fit in the remaining space
    if (this.buffer.length - this.writePos < chunk.length) {
      const availableData = this.buffer.subarray(this.readPos, this.writePos);
      const newSize = Math.max(availableData.length + chunk.length, this.buffer.length * 2);
      const newBuffer = new Uint8Array(newSize);

      newBuffer.set(availableData);
      this.buffer = newBuffer;
      this.writePos = availableData.length;
      this.readPos = 0;
    }

    this.buffer.set(chunk, this.writePos);
    this.writePos += chunk.length;

    const lines: Uint8Array[] = [];
    let lineStart = this.readPos;

    for (let i = this.readPos; i < this.writePos; i++) {
      if (this.buffer[i] === NEWLINE) {
        const lineEnd = i > 0 && this.buffer[i - 1] === CARRIAGE_RETURN ? i - 1 : i;
        lines.push(this.buffer.subarray(lineStart, lineEnd));
        lineStart = i + 1;
      }
    }

    this.readPos = lineStart;

    // Reset positions if buffer is fully read to maximize available space
    if (this.readPos === this.writePos) {
      this.readPos = 0;
      this.writePos = 0;
    }

    return lines;
  }

  flush(): Uint8Array | null {
    if (this.writePos > this.readPos) {
      const remaining = this.buffer.subarray(this.readPos, this.writePos);
      this.readPos = 0;
      this.writePos = 0;
      return remaining;
    }
    return null;
  }
}

/** Default exponential backoff with full jitter. */
export const defaultBackoff: BackoffStrategy = (attempt: number) => {
  const base = 100 * 2 ** attempt;
  return Math.random() * base;
};

export async function* fetchAndStream<T>(url: string | URL, opts: Opts<T> & { parser: Parser<T>; signal: AbortSignal }): AsyncGenerator<T, void, undefined> {
  const {
    parser, body, headers = {}, signal, bufferSize = DEFAULT_BUFFER_SIZE,
    retries = DEFAULT_RETRIES, timeout = DEFAULT_TIMEOUT, middleware = [],
    backoffStrategy = defaultBackoff, throttleMs, ...rest
  } = opts;

  let attempt = 0;
  while (true) {
    const attemptCtrl = new AbortController();
    const onAbort = () => attemptCtrl.abort();
    signal.addEventListener("abort", onAbort);
    const timeoutId = setTimeout(() => attemptCtrl.abort(new DOMException("Timeout", "TimeoutError")), timeout);

    try {
      const reqBody = typeof body === "object" && body?.constructor === Object ? JSON.stringify(body) : (body as BodyInit);
      const request = new Request(url, { ...rest, signal: attemptCtrl.signal, headers: { "Accept": "*/*", ...(typeof reqBody === "string" && { "Content-Type": "application/json" }), ...headers }, body: reqBody });
      const initialFetch: Next = (req) => fetch(req);
      const chain = middleware.reduceRight<Next>((next, mw) => (req) => mw(req, next), initialFetch);
      const res = await chain(request);

      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      if (!res.body) return;

      let stream = res.body;
      const encoding = res.headers.get('content-encoding');
      if (encoding === 'gzip' || encoding === 'deflate' || encoding === 'br') {
        // deno-lint-ignore no-explicit-any
        stream = stream.pipeThrough(new DecompressionStream(encoding as any));
      }


      const reader = stream.getReader();
      const processor = new LineProcessor(bufferSize);
      try {
        while (true) {
          if (attemptCtrl.signal.aborted) throw attemptCtrl.signal.reason ?? new DOMException("Aborted", "AbortError");
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of processor.push(value)) {
            const parsed = parser.parse(line);
            if (parsed !== null) {
              if (throttleMs && throttleMs > 0) await sleep(throttleMs);
              yield parsed;
            }
          }
        }
        const remaining = processor.flush();
        if (remaining) {
          const parsed = parser.parse(remaining);
          if (parsed !== null) {
            if (throttleMs && throttleMs > 0) await sleep(throttleMs);
            yield parsed;
          }
        }
        const final = parser.flush();
        if (final !== null) {
          if (throttleMs && throttleMs > 0) await sleep(throttleMs);
          yield final;
        }
        return; // Success
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      if (signal.aborted || attempt >= retries) {
        throw err;
      }
      attempt++;
      await sleep(backoffStrategy(attempt));
    } finally {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
    }
  }
}