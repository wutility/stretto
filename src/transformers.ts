import { CR, LF } from './constants';
import { Parser } from './types';

/**
 * A highly optimized, zero-copy TransformStream that splits a byte stream into lines.
 * It uses a "fast path" to avoid allocations when chunks are not split mid-line.
 */
export class LineTransformer extends TransformStream<Uint8Array, Uint8Array> {
  private leftover: Uint8Array = new Uint8Array(0);

  constructor() {
    super({
      transform: (chunk, controller) => {
        if (chunk.length === 0) return;
        const buffer = this.leftover.length > 0
          ? this.mergeBuffers(this.leftover, chunk)
          : chunk;

        let scanPosition = 0;
        for (let i = 0; i < buffer.length; i++) {
          if (buffer[i] === LF) {
            const lineEnd = i > 0 && buffer[i - 1] === CR ? i - 1 : i;
            controller.enqueue(buffer.subarray(scanPosition, lineEnd));
            scanPosition = i + 1;
          }
        }
        this.leftover = scanPosition < buffer.length
          ? buffer.subarray(scanPosition)
          : new Uint8Array(0);
      },
      flush: (controller) => {
        if (this.leftover.length > 0) {
          controller.enqueue(this.leftover);
        }
      },
    });
  }

  private mergeBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length + b.length);
    result.set(a);
    result.set(b, a.length);
    return result;
  }
}

/** A TransformStream that applies a user-defined parser to each chunk of data. */
export class ParserTransformer<T> extends TransformStream<Uint8Array, T> {
  constructor(parser: Parser<T>) {
    super({
      transform: (line, controller) => {
        parser.parse(line, controller);
      },
      flush: (controller) => {
        parser.flush(controller);
      },
    });
  }
}