import { decoder, SSE_DATA_PREFIX, SSE_EVENT_PREFIX, SSE_ID_PREFIX, COLON, SPACE } from './constants';
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

export class StreamingParser<T = unknown> implements Parser<T | string> {
  private sseBuffer: string[] = [];

  parse(line: Uint8Array, controller: TransformStreamDefaultController<T | string>): void {
    // An empty line signifies the end of an SSE message.
    if (!line || line.length === 0) {
      this.flushSseBuffer(controller);
      return;
    }

    if (bytesStartWith(line, SSE_DATA_PREFIX)) {
      let dataIndex = SSE_DATA_PREFIX.length;
      if (line.length > dataIndex && line[dataIndex] === SPACE) {
        dataIndex++;
      }
      const data = decoder.decode(line.subarray(dataIndex));
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

    // Flush any pending SSE data first.
    this.flushSseBuffer(controller);

    // Process the line as NDJSON or plain text.
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