import { decoder, SSE_DATA_PREFIX, SSE_EVENT_PREFIX, SSE_ID_PREFIX, COLON, } from './constants';
import { Parser } from './types';

export const safeJsonParse = <T = unknown>(text: string): T | null => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const bytesStartWith = (haystack: Uint8Array, needle: Uint8Array): boolean => {
  if (needle.length > haystack.length) return false;
  for (let i = 0; i < needle.length; i++) {
    if (haystack[i] !== needle[i]) return false;
  }
  return true;
};

export const trimLeadingSpace = (bytes: Uint8Array): Uint8Array => bytes[0] === 0x20 ? bytes.subarray(1) : bytes;

export class StreamingParser<T = unknown> implements Parser<T | string> {
  private sseBuffer: string[] = [];

  parse(line: Uint8Array, controller: TransformStreamDefaultController<T | string>): void {
    if (line.length === 0) {
      this.flushSseBuffer(controller);
      return;
    }

    if (bytesStartWith(line, SSE_DATA_PREFIX)) {
      const data = decoder.decode(trimLeadingSpace(line.subarray(SSE_DATA_PREFIX.length)));
      this.sseBuffer.push(data);
      return;
    }

    if (
      bytesStartWith(line, SSE_EVENT_PREFIX) ||
      bytesStartWith(line, SSE_ID_PREFIX) ||
      line[0] === COLON
    ) {
      return;
    }

    this.flushSseBuffer(controller);
    const text = decoder.decode(line);
    const parsedLine = safeJsonParse<T>(text) ?? text;
    controller.enqueue(parsedLine);
  }

  flush(controller: TransformStreamDefaultController<T | string>): void {
    this.flushSseBuffer(controller);
  }

  private flushSseBuffer(controller: TransformStreamDefaultController<T | string>): void {
    if (this.sseBuffer.length === 0) return;

    const data = this.sseBuffer.join('\n');
    this.sseBuffer.length = 0;
    const result = safeJsonParse<T>(data) ?? data;
    controller.enqueue(result);
  }
}