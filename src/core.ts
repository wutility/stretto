// core.ts

import { DEFAULT_BUFFER_SIZE } from "./constants";
import { Parser, Opts } from "./types";

/**
 * Manages a byte buffer to efficiently extract newline-delimited lines
 * from incoming chunks without string conversion.
 */
class LineProcessor {
  private buffer: Uint8Array;
  private position = 0;
  private static NEWLINE = 0x0A; // '\n'

  constructor(bufferSize: number) {
    this.buffer = new Uint8Array(bufferSize);
  }

  /**
   * Pushes a new chunk into the buffer and returns any complete lines found.
   * The buffer is dynamically resized if a very long line exceeds its capacity.
   */
  push(chunk: Uint8Array): Uint8Array[] {
    // Grow buffer if needed to prevent errors with very long lines
    if (this.position + chunk.length > this.buffer.length) {
      // PERF: Double the buffer size to reduce reallocation frequency.
      const newSize = Math.max(this.position + chunk.length, this.buffer.length * 2);
      const newBuffer = new Uint8Array(newSize);
      newBuffer.set(this.buffer.subarray(0, this.position));
      this.buffer = newBuffer;
    }

    this.buffer.set(chunk, this.position);
    this.position += chunk.length;

    const lines: Uint8Array[] = [];
    let lineStart = 0;

    // Search for newline bytes
    for (let i = 0; i < this.position; i++) {
      if (this.buffer[i] === LineProcessor.NEWLINE) {
        // Exclude carriage return (\r) if present
        const lineEnd = (i > 0 && this.buffer[i - 1] === 0x0D) ? i - 1 : i;
        lines.push(this.buffer.subarray(lineStart, lineEnd));
        lineStart = i + 1;
      }
    }

    // If lines were found, shift the remaining bytes to the beginning of the buffer.
    if (lineStart > 0) {
      this.buffer.copyWithin(0, lineStart, this.position);
      this.position -= lineStart;
    }

    return lines;
  }

  /** Returns any data remaining in the buffer, typically called at the end of a stream. */
  flush(): Uint8Array | null {
    if (this.position === 0) return null;
    // Return a slice of the buffer containing the remaining data
    return this.buffer.subarray(0, this.position);
  }
}

/**
 * Performs a single streaming fetch request and yields parsed data chunks.
 */
export async function* fetchAndParseStream<T>(url: string | URL, opts: Opts<T> & { parser: Parser<T>; signal: AbortSignal }): AsyncGenerator<T, void, undefined> {
  const {
    parser,
    body,
    headers = {},
    signal,
    bufferSize = DEFAULT_BUFFER_SIZE,
    onRequest,
    onResponse,
    ...rest
  } = opts;

  const reqBody = typeof body === 'object' && body.constructor === Object
    ? JSON.stringify(body)
    : body as BodyInit;

  // 1. Create Request object
  let request = new Request(url, {
    ...rest,
    signal,
    headers: {
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br',
      ...(typeof reqBody === 'string' && reqBody.startsWith('{')
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...headers,
    },
    body: reqBody,
  });

  // 2. Apply request interceptor
  if (onRequest) {
    request = await onRequest(request);
  }

  let res = await fetch(request);

  // 3. Apply response interceptor
  if (onResponse) {
    res = await onResponse(res);
  }

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  if (!res.headers.get('content-type')?.includes('text/event-stream')) {
    const buf = await res.arrayBuffer();
    const parsed = parser(buf);
    if (parsed !== null) yield parsed;
    return;
  }

  let stream = res.body!;
  const encHdr = res.headers.get('content-encoding');
  if (encHdr === 'gzip') stream = stream.pipeThrough(new DecompressionStream('gzip'));
  else if (encHdr === 'deflate') stream = stream.pipeThrough(new DecompressionStream('deflate'));
  else if (encHdr === 'br') stream = stream.pipeThrough(new DecompressionStream('br' as any));

  const reader = stream.getReader();
  const processor = new LineProcessor(bufferSize);

  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;

      // Push chunk into the processor and get back complete lines
      const lines = processor.push(value);
      for (const line of lines) {
        // Create a new ArrayBuffer slice for the parser
        const parsed = parser(line.buffer.slice(line.byteOffset, line.byteOffset + line.byteLength));
        if (parsed !== null) yield parsed;
      }
    }
    // Handle any final data that didn't end with a newline
    const remaining = processor.flush();
    if (remaining) {
      const parsed = parser(remaining.buffer.slice(remaining.byteOffset, remaining.byteOffset + remaining.byteLength));
      if (parsed !== null) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
}