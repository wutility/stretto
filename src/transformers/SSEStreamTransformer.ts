// src/lib/sseStreamTransformer.ts
import { RingBuffer } from "../lib/ringBuffer"; // Import RingBuffer

const sharedTextDecoder = new TextDecoder();

// --- Constants for SSE parsing (character codes for performance) ---
const CHAR_LF = 10; // '\n'
const CHAR_CR = 13; // '\r'
const CHAR_COLON = 58; // ':'
const CHAR_SPACE = 32; // ' '

const bufferSize: number = 8192; // 8KB fixed buffer

/*** Options for configuring the SSEStreamTransformer. */
export interface SSEStreamTransformerOptions {
  /**
   * If true, the transformer will attempt to parse the event data as JSON.
   * If successful, the `data` property of the resulting SSEEvent will be the parsed object of type T.
   * If parsing fails, or if this option is false, `data` will be the original string data.
   * Defaults to false.
   */
  parseData?: boolean;
  metadata?: boolean;
  bufferSize?: number
}

/**
 * Represents a parsed Server-Sent Event, aligning with the WHATWG spec's MessageEvent properties.
 * The type of the `data` property depends on the `parseData` option.
 */
export interface SSEEvent<T = any> {
  /**
   * The data for the event.
   * - If `parseData` option was `true` and parsing was successful, this is the parsed object of type `T`.
   * - Otherwise, this is the original string data.
   */
  data: T | string;
  /**
   * The type of the event (from the `event:` field). Defaults to 'message'.
   * Corresponds to the `type` attribute of the MessageEvent.
   */
  type: string;
  /**
   * The last seen event ID (from the `id:` field).
   * Corresponds to the `lastEventId` attribute of the MessageEvent.
   */
  lastEventId: string;
}

/**
 * A TransformStream that parses a stream of Uint8Arrays into SSEEvent objects.
 * Optimized for performance and low memory usage.
 */
export class SSEStreamTransformer<T = any>
  extends TransformStream<Uint8Array, SSEEvent<T>> {
  /**
   * Creates a new SSEStreamTransformer.
   * @param options Configuration options.
   */
  constructor(options?: SSEStreamTransformerOptions) {
    super(new SSEProcessor<T>(options));
  }
}

/**
 * Internal processor for SSE parsing logic.
 * Optimized for performance and low memory usage.
 */
class SSEProcessor<T> {
  private dataBufferParts: string[] = [];
  private eventTypeBuffer: string = "";
  private lastEventIdBuffer: string = "";

  private readonly parseData: boolean;
  private readonly metadata: boolean;

  private static readonly DEFAULT_EVENT_TYPE = "message";
  private ringBuffer: RingBuffer;

  constructor(options?: SSEStreamTransformerOptions) {
    this.parseData = options?.parseData ?? false;
    this.metadata = options?.metadata ?? false;
    this.ringBuffer = new RingBuffer(options.bufferSize ?? bufferSize);
  }

  transform(chunk: Uint8Array, controller: TransformStreamDefaultController<SSEEvent<T>>,) {
    this.ringBuffer.write(chunk);
    this.parseBuffer(controller);
  }

  flush(controller: TransformStreamDefaultController<SSEEvent<T>>) {
    // Handle the final event if the stream closes without a trailing newline.
    // This is a robustness improvement over the strict spec interpretation.
    if (this.dataBufferParts.length > 0) {
      this.dispatchEvent(controller);
    }
  }

  private parseBuffer(controller: TransformStreamDefaultController<SSEEvent<T>>,) {
    let pos = 0;

    // The loop now continues as long as lines are being processed and consumed.
    while (pos < this.ringBuffer.occupied) {
      const byte = this.ringBuffer.peekByte(pos);

      if (byte === CHAR_LF || byte === CHAR_CR) {
        const lineLength = pos;
        let lineEndLength = 1;

        if (
          byte === CHAR_CR && pos + 1 < this.ringBuffer.occupied &&
          this.ringBuffer.peekByte(pos + 1) === CHAR_LF
        ) {
          lineEndLength = 2;
        }

        if (lineLength > 0) {
          const lineView = this.ringBuffer.getView(0, lineLength);
          const lineText = sharedTextDecoder.decode(lineView);
          this.processLine(lineText);
        } else {
          this.dispatchEvent(controller);
        }

        // Consume immediately after processing a line/event block.
        this.ringBuffer.consume(lineLength + lineEndLength);
        pos = 0; // Reset position to scan from the start of the now-smaller buffer.
        continue;
      }

      pos++;
    }
  }

  private processLine(line: string) {
    if (line.charCodeAt(0) === CHAR_COLON) {
      return;
    }

    const colonIndex = line.indexOf(":");
    let fieldName: string;
    let fieldValue: string;

    if (colonIndex === -1) {
      fieldName = line;
      fieldValue = "";
    } else {
      fieldName = line.substring(0, colonIndex);
      fieldValue = line.substring(colonIndex + 1);
      if (fieldValue.charCodeAt(0) === CHAR_SPACE) {
        fieldValue = fieldValue.substring(1);
      }
    }

    switch (fieldName) {
      case "event":
        this.eventTypeBuffer = fieldValue;
        break;
      case "data":
        this.dataBufferParts.push(fieldValue);
        break;
      case "id":
        if (fieldValue.indexOf("\u0000") === -1) {
          this.lastEventIdBuffer = fieldValue;
        }
        break;
      case "retry":
        let isOnlyDigits = fieldValue.length > 0;
        for (let i = 0; i < fieldValue.length; i++) {
          const charCode = fieldValue.charCodeAt(i);
          if (charCode < 48 || charCode > 57) { // '0' to '9'
            isOnlyDigits = false;
            break;
          }
        }
        if (isOnlyDigits) {
          // Logic for setting reconnection delay would go here.
        }
        break;
      default:
        break;
    }
  }

  private dispatchEvent(controller: TransformStreamDefaultController<SSEEvent<T>>,) {
    if (this.dataBufferParts.length === 0) {
      this.resetEventBuffers();
      return;
    }

    let finalStringData = this.dataBufferParts.join("\n");
    if (finalStringData.endsWith("\n")) {
      finalStringData = finalStringData.slice(0, -1);
    }

    let dataValue: string | T = finalStringData;
    if (this.parseData) {
      try {
        dataValue = JSON.parse(finalStringData);
      } catch (error) {
        // Fallback to string if parsing fails, which is the correct behavior.
        console.warn(error);
      }
    }

    const event = this.metadata
      ? {
        data: dataValue,
        type: this.eventTypeBuffer || SSEProcessor.DEFAULT_EVENT_TYPE,
        lastEventId: this.lastEventIdBuffer,
      } as SSEEvent<T>
      : dataValue as any;

    controller.enqueue(event);
    this.resetEventBuffers();
  }

  private resetEventBuffers() {
    this.dataBufferParts.length = 0;
    this.eventTypeBuffer = "";
  }
}
