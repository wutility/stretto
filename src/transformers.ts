import { CR, LF } from './constants';
import { Parser } from './types';

/**
 * A high-performance TransformStream that splits a byte stream into lines.
 * It uses a single, reusable buffer to avoid frequent memory allocations,
 * and `copyWithin` to efficiently manage remaining data.
 */
export class LineTransformer extends TransformStream<Uint8Array, Uint8Array> {
  private buffer = new Uint8Array(8192); // 8KB reusable buffer
  private bufferLength = 0;

  constructor() {
    super({
      transform: (chunk, controller) => {
        if (chunk.length === 0) return;
        
        this.ensureCapacity(chunk.length);
        this.buffer.set(chunk, this.bufferLength);
        this.bufferLength += chunk.length;
        
        this.processLines(controller);
      },
      flush: (controller) => {
        if (this.bufferLength > 0) {
          controller.enqueue(this.buffer.subarray(0, this.bufferLength));
        }
      },
    });
  }

  private ensureCapacity(additionalBytes: number): void {
    const requiredSize = this.bufferLength + additionalBytes;
    if (requiredSize > this.buffer.length) {
      const newSize = Math.max(requiredSize, this.buffer.length * 2);
      const newBuffer = new Uint8Array(newSize);
      newBuffer.set(this.buffer.subarray(0, this.bufferLength));
      this.buffer = newBuffer;
    }
  }

  private processLines(controller: TransformStreamDefaultController<Uint8Array>): void {
    let scanPosition = 0;
    for (let i = 0; i < this.bufferLength; i++) {
      if (this.buffer[i] === LF) {
        const lineEnd = i > 0 && this.buffer[i - 1] === CR ? i - 1 : i;
        controller.enqueue(this.buffer.subarray(scanPosition, lineEnd));
        scanPosition = i + 1;
      }
    }
    
    // Shift remaining data to the beginning of the buffer
    if (scanPosition > 0) {
      this.buffer.copyWithin(0, scanPosition, this.bufferLength);
      this.bufferLength -= scanPosition;
    }
  }
}

/** A TransformStream that applies a user-defined parser to each chunk of data. */
export class ParserTransformer<T> extends TransformStream<Uint8Array, T> {
  constructor(parser: Parser<T>) {
    super({
      transform: (line, controller) => parser.parse(line, controller),
      flush: (controller) => parser.flush(controller),
    });
  }
}

/** A TransformStream that aborts if the provided signal is aborted. */
export class CancellationTransformer<T> extends TransformStream<T, T> {
  constructor(signal?: AbortSignal) {
    let abortHandler: (() => void) | undefined;
    super({
      start: (controller) => {
        if (signal?.aborted) {
          controller.error(new DOMException('Operation aborted', 'AbortError'));
          return;
        }
        abortHandler = () => {
          controller.error(new DOMException('Operation aborted', 'AbortError'));
          signal?.removeEventListener('abort', abortHandler!);
        };
        signal?.addEventListener('abort', abortHandler, { once: true });
      },
    });
  }
}