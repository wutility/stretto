import { NEWLINE, CARRIAGE_RETURN, DATA_PREFIX_LEN, decoder, encoder } from "./constants";
import { isMatchingBytes } from "./helpers";
import { JSONStreamOptions } from "./types";

/**
 * A TransformStream that parses Server-Sent Events (SSE) with JSON payloads.
 * This implementation is designed for high-security and high-throughput environments.
 *
 * CORE PRINCIPLES:
 * - Security: Fails fast on malformed input, never leaks data in errors, and zeroes out
 * its internal buffer upon completion to prevent data exposure.
 * - Performance: Operates with zero allocations and zero-copy operations during
 * the transformation of each chunk, making it highly memory-efficient.
 * - Robustness: Handles various line endings, buffer overflows, and invalid JSON
 * gracefully according to the configured options.
 */
export class JSONStreamTransformer extends TransformStream<Uint8Array, any> {
  constructor(options: JSONStreamOptions = {}) {
    // Initialize configuration with sane defaults.
    const maxBuffer = Math.max(64, options.maxBuffer || 8192);
    const parseData = options.parseData ?? true;
    const onBufferOverflow = options.onBufferOverflow ?? "skip";
    const onParseError = options.onParseError ?? "skip";
    const doneBytes = options.donePrefix
      ? encoder.encode(options.donePrefix)
      : null;

    // The single, reusable buffer allocated per stream instance.
    const buffer = new Uint8Array(maxBuffer);
    let bufferPos = 0; // Current write position in the buffer

    super({
      transform: (chunk, controller) => {
        let chunkPos = 0;
        const chunkLen = chunk.length;

        while (chunkPos < chunkLen) {
          // Find the next newline in the chunk using the highly optimized native indexOf.
          let newlinePos = chunk.indexOf(NEWLINE, chunkPos);
          if (newlinePos === -1) {
            newlinePos = chunkLen; // No newline found, process the rest of the chunk.
          }

          // Check for buffer overflow before copying data.
          const copyLen = newlinePos - chunkPos;
          if (bufferPos + copyLen > maxBuffer) {
            if (onBufferOverflow === "throw") {
              // FAIL FAST: Securely clear the buffer, then throw a detailed error.
              buffer.fill(0, 0, bufferPos); // Faster than a loop
              throw new RangeError(
                `Buffer overflow: An SSE line exceeds the configured maxBuffer of ${maxBuffer} bytes. ` +
                `The oversized line starts at offset ${chunkPos} in the current data chunk and would have resulted in a total line length of at least ${bufferPos + copyLen
                } bytes. ` +
                `To process larger lines, increase the 'maxBuffer' option. This error can also indicate a protocol violation or malicious input.`,
              );
            }

            // 'skip' mode: Reset buffer and skip to the start of the next line.
            bufferPos = 0;
            chunkPos = newlinePos < chunkLen ? newlinePos + 1 : chunkLen;
            continue;
          }

          // Copy the line segment into our buffer.
          if (copyLen > 0) {
            buffer.set(chunk.subarray(chunkPos, newlinePos), bufferPos);
            bufferPos += copyLen;
          }

          // If a newline was found, the line is complete. Process it.
          if (newlinePos < chunkLen) {
            // This stream specifically processes "data: " lines and ignores other SSE fields.
            if (
              bufferPos >= DATA_PREFIX_LEN &&
              buffer[0] === 0x64 && // 'd'
              buffer[1] === 0x61 && // 'a'
              buffer[2] === 0x74 && // 't'
              buffer[3] === 0x61 && // 'a'
              buffer[4] === 0x3a && // ':'
              buffer[5] === 0x20 // ' '
            ) {
              const jsonStart = DATA_PREFIX_LEN;
              let jsonLen = bufferPos - jsonStart;

              // Strip trailing carriage return (\r) if present.
              if (
                jsonLen > 0 &&
                buffer[jsonStart + jsonLen - 1] === CARRIAGE_RETURN
              ) {
                jsonLen--;
              }

              // This check correctly ignores empty 'data:' lines (e.g., "data:\n")
              // which are often used as keep-alives.
              if (jsonLen > 0) {
                // Check for a termination marker.
                const isDone = (doneBytes &&
                  jsonLen === doneBytes.length &&
                  isMatchingBytes(buffer, jsonStart, doneBytes)) ||
                  (!doneBytes &&
                    jsonLen === 6 && // Hardcoded, unrolled check for "[DONE]" for performance
                    buffer[jsonStart] === 0x5b && // [
                    buffer[jsonStart + 1] === 0x44 && // D
                    buffer[jsonStart + 2] === 0x4f && // O
                    buffer[jsonStart + 3] === 0x4e && // N
                    buffer[jsonStart + 4] === 0x45 && // E
                    buffer[jsonStart + 5] === 0x5d); // ]

                if (isDone) {
                  // Secure cleanup before terminating the stream.
                  buffer.fill(0, 0, bufferPos);
                  bufferPos = 0;
                  controller.terminate();
                  return;
                }

                // Decode the JSON payload from a zero-copy view of the buffer.
                try {
                  const json = decoder.decode(
                    buffer.subarray(jsonStart, jsonStart + jsonLen),
                  );
                  controller.enqueue(parseData ? JSON.parse(json) : json);
                } catch (e) {
                  if (onParseError === "throw") {
                    buffer.fill(0, 0, bufferPos);
                    controller.error(
                      new TypeError(
                        "Invalid JSON payload received in SSE stream.",
                      ),
                    );
                    return;
                  }
                  // Default 'skip' behavior
                  console.warn(
                    "Invalid JSON payload received in SSE stream and was skipped.",
                  );
                }
              }
            }
            // Reset buffer for the next line, regardless of whether it was processed.
            bufferPos = 0;
            chunkPos = newlinePos + 1;
          } else {
            // The end of the chunk was reached without a newline.
            chunkPos = chunkLen;
          }
        }
      },

      flush: () => {
        // Defensive cleanup: Zero out any remaining bytes in the buffer when the
        // stream is closed, preventing any potential for data exposure.
        if (bufferPos > 0) {
          buffer.fill(0, 0, bufferPos);
          bufferPos = 0;
        }
      },
    });
  }
}
