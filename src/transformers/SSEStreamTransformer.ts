// src/lib/sseStreamTransformer.ts
import { RingBuffer } from "../lib/ringBuffer";

const sharedTextDecoder = new TextDecoder();

// --- Constants for SSE parsing (character codes for performance) ---
const CHAR_LF = 10; // '\n'
const CHAR_CR = 13; // '\r'
const CHAR_COLON = 58; // ':'
const CHAR_SPACE = 32; // ' '

const minBufferSize: number = 2 * 1024;
const maxBufferSize: number = 8 * 1024;

/**
 * Options for configuring the SSEStreamTransformer.
 */
export interface SSEStreamTransformerOptions {
  parseData?: boolean;
  metadata?: boolean;
  minBufferSize?: number;
  maxBufferSize?: number;
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
  type?: string;
  /**
   * The last seen event ID (from the `id:` field).
   * Corresponds to the `lastEventId` attribute of the MessageEvent.
   */
  lastEventId?: string;
}

/**
 * A TransformStream that parses a stream of Uint8Arrays into SSEEvent objects.
 * Optimized for performance and low memory usage.
 */
export class SSEStreamTransformer<T = any> extends TransformStream<Uint8Array, SSEEvent<T>> {
  constructor(options?: SSEStreamTransformerOptions) {
    super(new SSEProcessor<T>({ minBufferSize, maxBufferSize, ...options }));
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

  // Pre-allocated empty string for default event type
  private static readonly DEFAULT_EVENT_TYPE = "message";

  private ringBuffer: RingBuffer;

  constructor(options?: SSEStreamTransformerOptions) {
    this.parseData = options?.parseData ?? false;
    this.metadata = options?.metadata ?? false;
    this.ringBuffer = new RingBuffer(options.minBufferSize ?? minBufferSize, options.maxBufferSize ?? maxBufferSize);
  }

  transform(chunk: Uint8Array, controller: TransformStreamDefaultController<SSEEvent<T>>,) {
    this.ringBuffer.write(chunk);
    this.parseBuffer(controller);
  }

  flush() {
    // As per spec: Once the end of the file is reached, any pending data must be discarded.
  }

  private parseBuffer(controller: TransformStreamDefaultController<SSEEvent<T>>,) {
    let lineStartPos = 0;
    const totalLength = this.ringBuffer.occupied;
    let pos = 0;

    while (pos < totalLength) {
      const byte = this.ringBuffer.peekByte(pos);

      // Check for line endings: LF, CR, or CRLF
      if (byte === CHAR_LF || byte === CHAR_CR) {
        const lineLength = pos - lineStartPos;
        let lineEndLength = 1;

        // Handle CRLF (\r\n)
        if (
          byte === CHAR_CR && pos + 1 < totalLength &&
          this.ringBuffer.peekByte(pos + 1) === CHAR_LF
        ) {
          lineEndLength = 2;
        }

        // Process the line content
        if (lineLength > 0) {
          const lineView = this.ringBuffer.getView(lineStartPos, lineLength);
          const lineText = sharedTextDecoder.decode(lineView);
          this.processLine(lineText);
        } else {
          // An empty line signifies the end of an event block
          this.dispatchEvent(controller);
        }

        // Move position past the line ending
        pos += lineEndLength;
        lineStartPos = pos;
        continue;
      }

      pos++;
    }

    // Consume processed bytes
    this.ringBuffer.consume(lineStartPos);
  }

  /**
   * Processes a single line according to the SSE specification.
   * @param line The text content of the line.
   * @param controller The TransformStream controller.
   */
  private processLine(line: string) {
    // Fast check for comment lines (starting with ':')
    if (line.charCodeAt(0) === CHAR_COLON) {
      return;
    }

    // Find the first colon to separate field name and value
    const colonIndex = line.indexOf(":");
    let fieldName: string;
    let fieldValue: string;

    if (colonIndex === -1) {
      // No colon: entire line is the field name, value is empty
      fieldName = line;
      fieldValue = "";
    } else {
      // Split the line at the first colon
      fieldName = line.substring(0, colonIndex);
      fieldValue = line.substring(colonIndex + 1);

      // If value starts with a space, remove it
      if (fieldValue.charCodeAt(0) === CHAR_SPACE) {
        fieldValue = fieldValue.substring(1);
      }
    }

    // Process the field based on its name
    switch (fieldName) {
      case "event":
        this.eventTypeBuffer = fieldValue;
        break;
      case "data":
        this.dataBufferParts.push(fieldValue);
        break;
      case "id":
        // If the field value does not contain U+0000 NULL, set the last event ID buffer
        if (fieldValue.indexOf("\u0000") === -1) {
          this.lastEventIdBuffer = fieldValue;
        }
        break;
      case "retry":
        // If the field value consists of only ASCII digits
        if (/^\d*$/.test(fieldValue)) {
          // In a full EventSource implementation, this would set the reconnection delay
        }
        break;
      default:
        // Unknown fields are ignored
        break;
    }
  }

  /**
   * Dispatches an event according to the SSE processing model.
   * @param controller The TransformStream controller to enqueue the event.
   */
  private dispatchEvent(
    controller: TransformStreamDefaultController<SSEEvent<T>>,
  ) {
    // If the data buffer is empty, reset buffers and return
    if (
      this.dataBufferParts.length === 0 ||
      (this.dataBufferParts.length === 1 && this.dataBufferParts[0] === "")
    ) {
      this.resetEventBuffers();
      return;
    }

    // Process the data buffer
    let finalStringData = this.dataBufferParts.join("\n");

    // If the data buffer's last character is LF, remove it
    if (finalStringData.charCodeAt(finalStringData.length - 1) === CHAR_LF) {
      finalStringData = finalStringData.slice(0, -1);
    }

    // Determine the final `data` value for the event object
    let dataValue: string | T = finalStringData;

    // Conditionally parse data if the option is enabled
    if (this.parseData) {
      try {
        dataValue = JSON.parse(finalStringData);
      } catch (error) {
        // If parsing fails, `dataValue` remains the original string
      }
    }

    // Create the event object
    const event = this.metadata ? {
      data: dataValue,
      type: this.eventTypeBuffer || SSEProcessor.DEFAULT_EVENT_TYPE,
      lastEventId: this.lastEventIdBuffer,
    } as SSEEvent<T> : dataValue as any;

    // Dispatch the event
    controller.enqueue(event);

    // Reset buffers for the next event
    this.resetEventBuffers();
  }

  /**
   * Resets the internal buffers for the next event.
   */
  private resetEventBuffers() {
    this.dataBufferParts.length = 0; // More efficient than creating new array
    this.eventTypeBuffer = "";
    // this.lastEventIdBuffer is preserved across events
  }
}
