import { DATA_PREFIX, LF, MAX_BUFFER_SIZE } from "./constants";

/**
 * Creates a TransformStream that parses Server-Sent Events (SSE) with a focus on performance.
 * It operates directly on byte arrays (`Uint8Array`) to minimize string allocations and garbage collection.
 */
export function sseParser<T>(options: {
  strictJson: boolean;
}): TransformStream<Uint8Array, T> {
  // A single, reusable buffer that grows exponentially to avoid frequent allocations.
  let buffer = new Uint8Array(65536); // 64KB initial size
  let position = 0;
  // A single TextDecoder instance is reused to avoid overhead.
  const textDecoder = new TextDecoder();

  return new TransformStream({
    transform(chunk, controller) {
      // Ensure buffer has enough capacity, growing if needed, up to a safety limit.
      if (position + chunk.length > buffer.length) {
        if (buffer.length >= MAX_BUFFER_SIZE) {
          controller.error(new Error(`SSE buffer size exceeded safety limit of ${MAX_BUFFER_SIZE} bytes.`));
          return;
        }
        const newSize = Math.max(buffer.length * 2, position + chunk.length);
        const newBuffer = new Uint8Array(Math.min(newSize, MAX_BUFFER_SIZE));
        newBuffer.set(buffer.subarray(0, position)); // copy existing data
        buffer = newBuffer;
      }
      buffer.set(chunk, position);
      position += chunk.length;

      // Process all complete messages (delimited by `\n\n`) in the buffer.
      let scanOffset = 0;
      while (true) {
        const messageEnd = findDoubleNewline(buffer, scanOffset, position);
        if (messageEnd === -1) break;

        // Use subarray() for a zero-copy view of the message data.
        const messageBytes = buffer.subarray(scanOffset, messageEnd);
        processMessage(messageBytes, controller);
        scanOffset = messageEnd + 2; // Move past the `\n\n` delimiter.
      }

      // If we processed any messages, shift the remaining data to the start of the buffer.
      // copyWithin() is an efficient, non-allocating way to move the data.
      if (scanOffset > 0) {
        buffer.copyWithin(0, scanOffset, position);
        position -= scanOffset;
      }
    },
    flush(controller) {
      // Process any final, unterminated message when the stream closes.
      if (position > 0) {
        processMessage(buffer.subarray(0, position), controller);
      }
    },
  });

  function findDoubleNewline(arr: Uint8Array, start: number, end: number): number {
    for (let i = start; i < end - 1; i++) {
      if (arr[i] === LF && arr[i + 1] === LF) {
        return i;
      }
    }
    return -1;
  }

  function processMessage(
    messageBytes: Uint8Array,
    controller: TransformStreamDefaultController<T>,
  ) {
    if (messageBytes.length === 0) return;

    // Byte-level scanning to extract 'data:' lines, avoiding intermediate strings.
    let lineStart = 0;
    const dataParts: string[] = [];
    for (let i = 0; i < messageBytes.length; i++) {
      if (messageBytes[i] === LF) {
        const line = messageBytes.subarray(lineStart, i);
        if (startsWith(line, DATA_PREFIX)) {
          dataParts.push(extractDataPayload(line));
        }
        lineStart = i + 1;
      }
    }
    // Process the last line which may not end with a newline.
    const lastLine = messageBytes.subarray(lineStart);
    if (startsWith(lastLine, DATA_PREFIX)) {
      dataParts.push(extractDataPayload(lastLine));
    }

    if (dataParts.length === 0) return;

    const payload = dataParts.join("\n");
    if (payload === '[DONE]') return;

    try {
      controller.enqueue(JSON.parse(payload));
    } catch (error) {
      if (options.strictJson) {
        const cause = error instanceof Error ? error : undefined;
        controller.error(
          new TypeError(`Invalid JSON in SSE stream: "${payload}"`, { cause }),
        );
      }
      // In non-strict mode, we silently ignore parse errors.
    }
  }

  // Extracts the data part of a "data:" line, skipping the prefix and an optional space.
  function extractDataPayload(line: Uint8Array): string {
    let startIndex = DATA_PREFIX.length;
    // Skip optional leading space: `data: {...}` vs `data:{...}`
    if (line.length > startIndex && line[startIndex] === 0x20) {
      startIndex++;
    }
    return textDecoder.decode(line.subarray(startIndex));
  }

  // A fast, allocation-free utility to check if a Uint8Array starts with a prefix.
  function startsWith(arr: Uint8Array, prefix: Uint8Array): boolean {
    if (prefix.length > arr.length) return false;
    // Optimized loop for byte-by-byte comparison.
    for (let i = 0; i < prefix.length; i++) {
      if (arr[i] !== prefix[i]) return false;
    }
    return true;
  }
}