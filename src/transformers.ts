import { BUFFER_SIZE, MAX_LINE_LENGTH, CR, LF } from './constants';
import { Parser } from './types';

/** A TransformStream that splits an incoming byte stream into lines. */
export class LineTransformer extends TransformStream<Uint8Array, Uint8Array> {
  constructor() {
    let buffer = new Uint8Array(BUFFER_SIZE);
    let position = 0;
    let scanPosition = 0;

    super({
      transform: (chunk, controller) => {
        if (position + chunk.length > buffer.length) {
          if (position + chunk.length > MAX_LINE_LENGTH) {
            throw new Error(`Line exceeds maximum length of ${MAX_LINE_LENGTH} bytes`);
          }
          const newSize = Math.max(buffer.length * 2, position + chunk.length);
          const newBuffer = new Uint8Array(newSize);
          newBuffer.set(buffer.subarray(0, position));
          buffer = newBuffer;
        }

        buffer.set(chunk, position);
        position += chunk.length;

        // Process the buffer to find line breaks, starting from where we left off.
        for (let i = scanPosition; i < position; i++) {
          if (buffer[i] === LF) {
            const end = i > 0 && buffer[i - 1] === CR ? i - 1 : i;
            controller.enqueue(buffer.subarray(scanPosition, end));
            scanPosition = i + 1;
          }
        }

        if (scanPosition > 0) {
          buffer.copyWithin(0, scanPosition, position);
          position -= scanPosition;
          scanPosition = 0;
        }
      },
      flush: (controller) => {
        if (position > 0) {
          controller.enqueue(buffer.subarray(0, position));
        }
      },
    });
  }
}

/** A TransformStream that applies a parser to each chunk of data. */
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

/** A TransformStream that terminates the stream if an AbortSignal is received. */
export class CancellationTransformer<T> extends TransformStream<T, T> {
  constructor(signal?: AbortSignal) {
    super({
      start: (controller) => {
        if (signal?.aborted) {
          controller.error(new DOMException('Operation aborted', 'AbortError'));
          return;
        }
        signal?.addEventListener(
          'abort',
          () => {
            controller.error(new DOMException('Operation aborted', 'AbortError'));
          },
          { once: true }
        );
      },
    });
  }
}