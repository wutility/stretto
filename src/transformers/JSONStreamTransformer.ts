import { RingBuffer } from "../lib/ringBuffer";

// Shared TextDecoder to avoid re-instantiation
const decoder = new TextDecoder();

// Pre-encoded constants for faster comparison
const NEWLINE = 0x0A;
const SPACE = 0x20;
const CARRIAGE_RETURN = 0x0D;
const OPEN_BRACE = 0x7B;
const CLOSE_BRACE = 0x7D;
const OPEN_BRACKET = 0x5B;
const CLOSE_BRACKET = 0x5D;
const BACKSLASH = 0x5C;
const QUOTE = 0x22;

const minBufferSize: number = 2 * 1024;
const maxBufferSize: number = 8 * 1024;

export interface JSONStreamTransformerOptions {
  parseData?: boolean;
  metadata?: boolean;
  minBufferSize?: number;
  maxBufferSize?: number;
}

/**
 * High-performance JSON stream transformer with zero-copy operations.
 */
export class JSONStreamTransformer extends TransformStream<Uint8Array, any> {
  constructor(options?: JSONStreamTransformerOptions) {
    super(new JSONTransformer({minBufferSize,maxBufferSize, ...options}));
  }
}

class JSONTransformer {
  private ringBuffer: RingBuffer;
  private bracketCount = 0;
  private braceCount = 0;
  private inString = false;
  private escapeNext = false;
  private done = false;
  private jsonStartPos = -1;
  private expectingArray = false;

  constructor(options?: JSONStreamTransformerOptions) {
    this.ringBuffer = new RingBuffer(options.minBufferSize ?? minBufferSize, options.maxBufferSize ?? maxBufferSize);
  }

  transform(chunk: Uint8Array, controller: TransformStreamDefaultController<any>,) {
    if (this.done) return;
    this.ringBuffer.write(chunk);
    this.processBuffer(controller);
  }

  flush(controller: TransformStreamDefaultController<any>) {
    this.processBuffer(controller, true);
  }

  private processBuffer(controller: TransformStreamDefaultController<any>, isFlush = false,) {
    const totalLength = this.ringBuffer.occupied;
    let pos = 0;

    while (pos < totalLength) {
      // Fast [DONE] check - inline for maximum performance
      if (pos + 6 <= totalLength && this.ringBuffer.matchSequence(pos, [91, 68, 79, 78, 69, 93])) {
        this.done = true;
        controller.terminate();
        this.ringBuffer.consume(pos + 6);
        return;
      }

      const byte = this.ringBuffer.peekByte(pos);

      // Outside JSON context
      if (this.braceCount === 0 && this.bracketCount === 0 && this.jsonStartPos === -1) {
        // Fast path for common delimiters
        if (byte === NEWLINE || byte === SPACE) {
          pos++;
          continue;
        }

        // Handle multi-byte delimiters
        if (byte === CARRIAGE_RETURN) {
          if (
            pos + 1 < totalLength &&
            this.ringBuffer.peekByte(pos + 1) === NEWLINE
          ) {
            pos += 2;
            continue;
          }
          pos++;
          continue;
        }

        if (byte === NEWLINE) {
          if (
            pos + 1 < totalLength &&
            this.ringBuffer.peekByte(pos + 1) === NEWLINE
          ) {
            pos += 2;
            continue;
          }
          pos++;
          continue;
        }

        // Start of JSON
        if (byte === OPEN_BRACE || byte === OPEN_BRACKET) {
          this.jsonStartPos = pos;
          this.expectingArray = byte === OPEN_BRACKET;
          if (this.expectingArray) {
            this.bracketCount = 1;
          } else {
            this.braceCount = 1;
          }
          this.inString = false;
          this.escapeNext = false;
          pos++;
          continue;
        }

        pos++;
        continue;
      }

      // Inside JSON content processing
      if (this.jsonStartPos !== -1) {
        if (this.escapeNext) {
          this.escapeNext = false;
        } else {
          if (byte === BACKSLASH) {
            this.escapeNext = true;
          } else if (byte === QUOTE) {
            this.inString = !this.inString;
          } else if (!this.inString) {
            // Process brackets/braces only when not in string
            if (this.expectingArray) {
              if (byte === OPEN_BRACKET) {
                this.bracketCount++;
              } else if (byte === CLOSE_BRACKET && --this.bracketCount === 0) {
                this.emitJSON(controller, this.jsonStartPos, pos + 1);
                pos++;
                continue;
              }
            } else {
              if (byte === OPEN_BRACE) {
                this.braceCount++;
              } else if (byte === CLOSE_BRACE && --this.braceCount === 0) {
                this.emitJSON(controller, this.jsonStartPos, pos + 1);
                pos++;
                continue;
              }
            }
          }
        }
      }

      pos++;
    }

    // Buffer management
    if (this.jsonStartPos === -1) {
      this.ringBuffer.consume(totalLength);
    } else if (
      isFlush && this.braceCount === 0 && this.bracketCount === 0 &&
      this.jsonStartPos !== -1
    ) {
      this.emitJSON(controller, this.jsonStartPos, totalLength);
      this.ringBuffer.consume(totalLength);
      this.jsonStartPos = -1;
    } else if (this.jsonStartPos > 0) {
      this.ringBuffer.consume(this.jsonStartPos);
      this.jsonStartPos = 0;
    }
  }

  private emitJSON(controller: TransformStreamDefaultController<any>, start: number, end: number,) {
    const length = end - start;
    if (length <= 0) return;

    const view = this.ringBuffer.getView(start, length);
    const jsonString = decoder.decode(view, { stream: true });

    try {
      controller.enqueue(JSON.parse(jsonString));
    } catch {
      // Silently ignore invalid JSON
      console.warn("Invalid JSON detected:", jsonString);
    }

    // Reset state
    this.jsonStartPos = -1;
    this.braceCount = 0;
    this.bracketCount = 0;
    this.expectingArray = false;
  }
}
