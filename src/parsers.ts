import { decoder, SSE_DATA_PREFIX, SSE_EVENT_PREFIX, SSE_ID_PREFIX, COLON } from './constants';
import { Parser } from './types';
import { bytesStartWith, trimLeadingSpace, safeJsonParse } from './utilities';

interface ParserOptions {
  strict?: boolean;
}

/** Abstract base class for parsers to handle common options. */
abstract class BaseParser<T> implements Parser<T> {
  /**
   * @param options.strict If true, throws an error on invalid JSON. If false,
   * silently drops the malformed data. Defaults to `true`.
   */
  protected readonly strict: boolean;
  constructor(options: ParserOptions = {}) { this.strict = options.strict ?? true; }
  abstract parse(line: Uint8Array, controller: TransformStreamDefaultController<T>): void;
  abstract flush(controller: TransformStreamDefaultController<T>): void;
  abstract reset(): void;
}

export class SseParser<T = unknown> extends BaseParser<T> {
  reset(): void {
    throw new Error('Method not implemented.');
  }
  private sseBuffer: string[] = [];

  parse(line: Uint8Array, controller: TransformStreamDefaultController<T>): void {
    if (line.length === 0) {
      this.flushSseBuffer(controller);
      return;
    }
    if (bytesStartWith(line, SSE_DATA_PREFIX)) {
      const data = decoder.decode(trimLeadingSpace(line.subarray(SSE_DATA_PREFIX.length)));
      this.sseBuffer.push(data);
      return;
    }
    if (bytesStartWith(line, SSE_EVENT_PREFIX) || bytesStartWith(line, SSE_ID_PREFIX) || line[0] === COLON) {
      return;
    }
    this.flushSseBuffer(controller);
    const text = decoder.decode(line);
    const parsedLine = safeJsonParse<T>(text);
    if (parsedLine !== null) {
      controller.enqueue(parsedLine);
    } else if (this.strict) {
      throw new TypeError(`Invalid JSON received in stream: "${text}"`);
    }
  }

  flush(controller: TransformStreamDefaultController<T>): void {
    this.flushSseBuffer(controller);
  }

  private flushSseBuffer(controller: TransformStreamDefaultController<T>): void {
    if (this.sseBuffer.length === 0) return;
    const data = this.sseBuffer.join('\n');
    this.sseBuffer.length = 0;
    const result = safeJsonParse<T>(data);
    if (result !== null) {
      controller.enqueue(result);
    } else if (this.strict) {
      throw new TypeError(`Invalid JSON received in SSE data buffer: "${data}"`);
    }
  }
}
