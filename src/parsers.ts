import { decoder, SSE_DATA_PREFIX, SSE_EVENT_PREFIX, SSE_ID_PREFIX, COLON } from './constants';
import { Parser } from './types';
import { bytesStartWith, trimLeadingSpace, safeJsonParse } from './utilities';


interface ParserOptions {
  /** If true, throw an error on invalid JSON. If false, silently drop the line. @default true */
  strict?: boolean;
}

/**
 * A parser for Server-Sent Events (SSE).
 * It correctly buffers multi-line `data:` fields and dispatches an event
 * only when an empty line is received, as per the SSE specification.
 */
export class SseParser<T = unknown> implements Parser<T> {
  private sseBuffer: string[] = [];
  private readonly strict: boolean;

  constructor(options: ParserOptions = {}) {
    this.strict = options.strict ?? true;
  }

  parse(line: Uint8Array, controller: TransformStreamDefaultController<T>): void {
    // An empty line signifies the end of an event. Dispatch the buffered data.
    if (line.length === 0) {
      this.flushSseBuffer(controller);
      return;
    }

    if (bytesStartWith(line, SSE_DATA_PREFIX)) {
      const data = decoder.decode(trimLeadingSpace(line.subarray(SSE_DATA_PREFIX.length)));
      this.sseBuffer.push(data);
      return;
    }

    // Ignore event, id, retry, and comment lines as part of the current event.
    if (bytesStartWith(line, SSE_EVENT_PREFIX) || bytesStartWith(line, SSE_ID_PREFIX) || line[0] === COLON) {
      return;
    }

    // If we receive a line that is not a valid SSE field, we can treat it as a
    // different data format (e.g., JSON Lines). First, flush any pending SSE data.
    this.flushSseBuffer(controller);
    const text = decoder.decode(line);
    const parsedLine = safeJsonParse<T>(text);

    if (parsedLine !== null) {
      controller.enqueue(parsedLine);
    } else if (this.strict) {
      throw new TypeError(`Invalid JSON received in stream: "${text}"`);
    }
    // In non-strict mode, silently drop the un-parsable line.
  }

  flush(controller: TransformStreamDefaultController<T>): void {
    this.flushSseBuffer(controller);
  }

  private flushSseBuffer(controller: TransformStreamDefaultController<T>): void {
    if (this.sseBuffer.length === 0) return;
  
    // More efficient for large buffers
    let data: string;
    if (this.sseBuffer.length === 1) {
      data = this.sseBuffer[0];
    } else {
      data = this.sseBuffer.join('\n');
    }
    
    this.sseBuffer.length = 0;
    const result = safeJsonParse<T>(data);
  
    if (result !== null) {
      controller.enqueue(result);
    } else if (this.strict) {
      throw new TypeError(`Invalid JSON received in SSE data buffer: "${data}"`);
    }
  }

  reset(): void {
    this.sseBuffer.length = 0;
  }
}

/**
 * A parser for JSON Lines (JSONL) / newline-delimited JSON (NDJSON).
 * Each non-empty line is parsed as an independent JSON object.
 */
export class JsonLinesParser<T = unknown> implements Parser<T> {
  private readonly strict: boolean;

  constructor(options: ParserOptions = {}) {
    this.strict = options.strict ?? true;
  }

  parse(line: Uint8Array, controller: TransformStreamDefaultController<T>): void {
    if (line.length === 0) {
      return; // Ignore empty lines
    }

    const text = decoder.decode(line);
    const parsedLine = safeJsonParse<T>(text);

    if (parsedLine !== null) {
      controller.enqueue(parsedLine);
    } else if (this.strict) {
      throw new TypeError(`Invalid JSON received in stream: "${text}"`);
    }
    // In non-strict mode, we silently drop the un-parsable line.
  }

  flush(_controller: TransformStreamDefaultController<T>): void {
    // No-op, as JSONL parsing is stateless.
  }
}