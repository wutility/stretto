import { RingBuffer } from "../lib/ringBuffer";

const decoder = new TextDecoder();
const NEWLINE = 0x0A;
const DONE_PREFIX = "[DONE]";
const DATA_PREFIX = "data: ";

export interface JSONStreamTransformerOptions {
  donePrefix?: string
  dataPrefix?: string
  parseData?: boolean;
  bufferSize?: number;
}

export class JSONStreamTransformer extends TransformStream<Uint8Array, any> {
  constructor(options?: JSONStreamTransformerOptions) {
    super(new JSONTransformer(options));
  }
}

class JSONTransformer {
  private options: JSONStreamTransformerOptions;
  private ringBuffer: RingBuffer;

  constructor(ops?: JSONStreamTransformerOptions) {
    this.options = {
      donePrefix: DONE_PREFIX,
      dataPrefix: DATA_PREFIX,
      parseData: true,
      ...ops
    };

    this.ringBuffer = new RingBuffer(this.options.bufferSize);
  }

  transform(chunk: Uint8Array, controller: TransformStreamDefaultController<any>,) {
    // Write the incoming chunk to our buffer.
    if (!this.ringBuffer.write(chunk)) {
      controller.error(
        new Error(
          "Buffer overflow. A single message or line might be larger than the buffer size.",
        ),
      );
      return;
    }
    // Process the buffer, looking for complete lines.
    this.processBuffer(controller);
  }

  flush(controller: TransformStreamDefaultController<any>) {
    this.processBuffer(controller, true);
  }

  /**
   * Scans the RingBuffer for newline characters, indicating complete lines.
   * This is far more robust for SSE streams than counting braces.
   */
  private processBuffer(controller: TransformStreamDefaultController<any>, isFlush = false,) {
    let pos = 0;

    while (pos < this.ringBuffer.occupied) {
      // Search for the next newline character.
      const newlineIndex = this.findByte(NEWLINE, pos);

      if (newlineIndex === -1) {
        // No complete line found in the buffer.
        // If flushing, process the remaining partial line.
        if (isFlush && this.ringBuffer.occupied > 0) {
          this.parseLine(controller, this.ringBuffer.occupied);
          this.ringBuffer.consume(this.ringBuffer.occupied);
        }
        // Otherwise, wait for more data to complete the line.
        break;
      }

      // We found a complete line.
      const lineLength = newlineIndex - pos;
      this.parseLine(controller, lineLength);

      // Consume the line and its newline character from the buffer.
      const bytesToConsume = lineLength + 1;
      this.ringBuffer.consume(bytesToConsume);

      // Reset position to scan again from the start of the modified buffer.
      pos = 0;
    }
  }

  /**
   * Parses a single line of data from the buffer.
   */
  private parseLine(controller: TransformStreamDefaultController<any>, lineLength: number,) {
    if (lineLength === 0) return; // Skip empty lines

    const view = this.ringBuffer.getView(0, lineLength);
    const line = decoder.decode(view);

    if (line.startsWith(this.options.dataPrefix)) {
      const jsonString = line.substring(this.options.dataPrefix.length);

      // Some streams send a [DONE] message
      if (jsonString.trim() === this.options.donePrefix) {
        controller.terminate();
        return;
      }

      try {
        controller.enqueue(this.options.parseData ? JSON.parse(jsonString) : jsonString);
      } catch (e) {
        this.options.parseData
          ? console.error("Failed to parse invalid JSON chunk:", jsonString, "Error:", e,)
          : controller.enqueue(jsonString)
      }
    }
  }

  /**
   * Helper to find the first occurrence of a byte in the buffer.
   * Returns -1 if not found.
   */
  private findByte(byte: number, startOffset: number): number {
    for (let i = startOffset; i < this.ringBuffer.occupied; i++) {
      if (this.ringBuffer.peekByte(i) === byte) {
        return i;
      }
    }
    return -1;
  }
}
