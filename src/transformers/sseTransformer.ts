// src/transformers/sseTransformer.ts
import { RingBuffer } from "../lib/ringBuffer";

interface SseMessage<T> {
  data: T;
  event?: string;
  id?: string;
}

interface TransformOptions {
  strictJson?: boolean;
  includeEventAndId?: boolean;
  pureJson?: boolean;
  minBufferSize?: number;
  maxBufferSize?: number;
}

export function sseTransformer<T>(
  options: TransformOptions = {},
): TransformStream<Uint8Array, T extends SseMessage<any> ? T : any> {
  const {
    strictJson = true,
    includeEventAndId = false,
    pureJson = false,
    minBufferSize = 65536,
    maxBufferSize = 1024 * 1024,
  } = options;

  if (minBufferSize < 0 || maxBufferSize < 0) {
    throw new RangeError("Buffer sizes must be non-negative");
  }
  if (minBufferSize > maxBufferSize) {
    throw new RangeError("minBufferSize cannot exceed maxBufferSize");
  }

  const bufferSize = Math.max(minBufferSize, 65536);
  const buffer = new RingBuffer(bufferSize);

  // Pre-compiled patterns for zero-copy searching
  const DOUBLE_LF = [0x0a, 0x0a]; // \n\n
  const CRLF_CRLF = [0x0d, 0x0a, 0x0d, 0x0a]; // \r\n\r\n

  // TextDecoder reuse
  const decoder = new TextDecoder();

  // Pre-compiled field prefixes
  const DATA_PREFIX = [100, 97, 116, 97, 58]; // 'data:'
  const EVENT_PREFIX = [101, 118, 101, 110, 116, 58]; // 'event:'
  const ID_PREFIX = [105, 100, 58]; // 'id:'
  const LF = 0x0a;
  const CR = 0x0d;

  /**
   * Zero-copy message boundary detection
   */
  function findMessageBoundary(): | { offset: number; delimiterLength: number } | null {
    // Search for \n\n first (more common)
    let offset = buffer.findPattern(DOUBLE_LF);
    if (offset !== -1) {
      return { offset, delimiterLength: 2 };
    }

    // Search for \r\n\r\n
    offset = buffer.findPattern(CRLF_CRLF);
    if (offset !== -1) {
      return { offset, delimiterLength: 4 };
    }

    return null;
  }

  /**
   * Zero-copy field extraction without string operations
   */
  function parseMessageFields(messageLength: number,): { data: Uint8Array[]; event?: string; id?: string } {
    const dataChunks: Uint8Array[] = [];
    let event: string | undefined;
    let id: string | undefined;

    let pos = 0;
    while (pos < messageLength) {
      // Find line end
      let lineEnd = pos;
      while (lineEnd < messageLength && buffer.peekByte(lineEnd) !== LF) {
        lineEnd++;
      }

      const lineLength = lineEnd - pos;
      if (lineLength === 0) {
        pos = lineEnd + 1;
        continue;
      }

      // Remove trailing CR if present
      const actualLineLength =
        (lineLength > 0 && buffer.peekByte(lineEnd - 1) === CR)
          ? lineLength - 1
          : lineLength;

      // Zero-copy prefix checking
      if (actualLineLength >= 5 && checkPrefix(pos, DATA_PREFIX)) {
        let dataStart = pos + 5; // Skip "data:"
        // FIX: Check for and skip the optional leading space
        if (buffer.peekByte(dataStart) === 0x20 /* space */) {
          dataStart++;
        }
        const dataLength = (pos + actualLineLength) - dataStart;
        if (dataLength > 0) {
          dataChunks.push(buffer.getView(dataStart, dataLength));
        }
      } else if (includeEventAndId) {
        // Apply the same fix for EVENT_PREFIX and ID_PREFIX
        if (actualLineLength >= 6 && checkPrefix(pos, EVENT_PREFIX)) {
          let eventStart = pos + 6; // Skip "event:"
          if (buffer.peekByte(eventStart) === 0x20) {
            eventStart++;
          }
          const eventData = buffer.getView(eventStart, (pos + actualLineLength) - eventStart,);
          event = decoder.decode(eventData);
        }
        else if (actualLineLength >= 3 && checkPrefix(pos, ID_PREFIX)) {
          // id  
          let eventStart = pos + 3; // Skip "id:"
          if (buffer.peekByte(eventStart) === 0x20) {
            eventStart++;
          }
          const eventData = buffer.getView(eventStart, (pos + actualLineLength) - eventStart,);
          event = decoder.decode(eventData);
        }
      }

      pos = lineEnd + 1;
    }

    return { data: dataChunks, event, id };
  }

  /**
   * Zero-copy prefix matching
   */
  function checkPrefix(offset: number, prefix: number[]): boolean {
    for (let i = 0; i < prefix.length; i++) {
      if (buffer.peekByte(offset + i) !== prefix[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Optimized data reconstruction with minimal copying
   */
  function reconstructData(dataChunks: Uint8Array[]): string {
    if (dataChunks.length === 0) {
      return "";
    }

    if (dataChunks.length === 1) {
      return decoder.decode(dataChunks[0]);
    }

    // Calculate total length for single allocation
    let totalLength = 0;
    for (const chunk of dataChunks) {
      totalLength += chunk.length;
    }
    totalLength += dataChunks.length - 1; // Add space for newlines

    // Single allocation for all data
    const combined = new Uint8Array(totalLength);
    let offset = 0;

    for (let i = 0; i < dataChunks.length; i++) {
      if (i > 0) {
        combined[offset++] = LF;
      }
      combined.set(dataChunks[i], offset);
      offset += dataChunks[i].length;
    }

    return decoder.decode(combined);
  }

  return new TransformStream<Uint8Array, any>({
    transform(chunk, controller) {
      try {
        if (!buffer.write(chunk)) {
          controller.error(
            new Error(
              `Buffer overflow: chunk size ${chunk.length} exceeds available space ${buffer.available}`,
            ),
          );
          return;
        }

        // Process all complete messages
        while (buffer.occupied > 0) {
          const boundary = findMessageBoundary();
          if (!boundary) {
            break; // No complete message
          }

          const messageLength = boundary.offset;
          if (messageLength === 0) {
            // Empty message (just delimiters) - consume and continue
            buffer.consume(boundary.delimiterLength);
            continue;
          }

          try {
            const fields = parseMessageFields(messageLength);

            if (fields.data.length > 0) {
              const dataStr = reconstructData(fields.data);

              // Handle [DONE] signal
              if (dataStr === "[DONE]") {
                buffer.consume(messageLength + boundary.delimiterLength);
                continue;
              }

              let result: any;

              if (pureJson) {
                result = JSON.parse(dataStr);
              } else {
                try {
                  result = JSON.parse(dataStr);
                } catch (e) {
                  if (strictJson) {
                    throw e;
                  }
                  result = dataStr; // Return raw string in non-strict mode
                }
              }

              if (includeEventAndId) {
                controller.enqueue({
                  data: result,
                  event: fields.event,
                  id: fields.id,
                } as any);
              } else {
                controller.enqueue(result as any);
              }
            }
          } catch (e) {
            if (strictJson) {
              controller.error(e);
              return;
            }
            // Skip malformed message in non-strict mode
          }

          // Consume processed message and delimiter
          buffer.consume(messageLength + boundary.delimiterLength);
        }
      } catch (e) {
        controller.error(e);
      }
    },

    flush(controller) {
      // Handle remaining incomplete data - fix potential data loss
      if (buffer.occupied > 0) {
        try {
          // Check if we have any potential SSE message
          const fields = parseMessageFields(buffer.occupied);

          if (fields.data.length > 0) {
            const dataStr = reconstructData(fields.data);

            // Skip [DONE] signals in flush
            if (dataStr !== "[DONE]") {
              let result: any;

              if (pureJson) {
                result = JSON.parse(dataStr);
                controller.enqueue(result as any);
              } else {
                try {
                  result = JSON.parse(dataStr);
                } catch (e) {
                  if (strictJson) {
                    controller.error(
                      new Error(
                        `Failed to parse remaining JSON data: ${dataStr}`,
                        { cause: e },
                      ),
                    );
                    return;
                  }
                  result = dataStr; // Return raw string in non-strict mode
                }

                if (includeEventAndId) {
                  controller.enqueue({
                    data: result,
                    event: fields.event,
                    id: fields.id,
                  } as any);
                } else {
                  controller.enqueue(result as any);
                }
              }
            }
          } else if (!strictJson) {
            // No structured data found, but we have content
            // Try to extract any raw text that might be incomplete SSE
            const remainingBytes = buffer.getView(0, buffer.occupied);
            const text = decoder.decode(remainingBytes).trim();

            if (text.length > 0 && text !== "[DONE]") {
              // Check if it looks like incomplete JSON or raw data
              if (
                text.startsWith("{") || text.startsWith("[") ||
                text.startsWith('"')
              ) {
                try {
                  const result = JSON.parse(text);
                  controller.enqueue(result as any);
                } catch {
                  // Not valid JSON, enqueue as string
                  controller.enqueue(text as any);
                }
              } else {
                controller.enqueue(text as any);
              }
            }
          }
        } catch (e) {
          if (strictJson) {
            controller.error(e);
          }
          // In non-strict mode, log warning but don't error
          console.warn("SSE flush warning:", e);
        }
      }
    },
  });
}
