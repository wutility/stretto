// parsers.ts

import { dec, enc } from "./constants";
import { Parser } from "./types";

// --- SSE Parser Byte-Level Constants ---
// "data:"
const SSE_DATA_PREFIX = new Uint8Array([100, 97, 116, 97, 58]);
// "[DONE]"
const SSE_DONE_MARKER = new Uint8Array([91, 68, 79, 78, 69, 93]);
const SSE_COMMENT_PREFIX = 58; // Byte for ":"
const SSE_SPACE = 32;          // Byte for " "

const safeJson = (buf: ArrayBufferLike) => {
  try {
    return JSON.parse(dec.decode(buf));
  } catch {
    return null;
  }
};

/** Compares two Uint8Arrays for equality. */
const areArraysEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

/**
 * A high-performance SSE parser that operates directly on bytes.
 * It avoids string conversion for line processing.
 */
export const sseParser: Parser = (buf) => {
  const line = new Uint8Array(buf);

  // Ignore empty lines or comments
  if (line.length === 0 || line[0] === SSE_COMMENT_PREFIX) {
    return null;
  }

  let dataIndex = 0;
  // Check if the line starts with "data:"
  let hasDataPrefix = true;
  if (line.length > SSE_DATA_PREFIX.length) {
    for (let i = 0; i < SSE_DATA_PREFIX.length; i++) {
      if (line[i] !== SSE_DATA_PREFIX[i]) {
        hasDataPrefix = false;
        break;
      }
    }
  } else {
    hasDataPrefix = false;
  }

  if (hasDataPrefix) {
    dataIndex = SSE_DATA_PREFIX.length;
  }

  // Slice the payload from the buffer
  let payload = line.subarray(dataIndex);

  // Trim a single leading space if it exists
  if (payload.length > 0 && payload[0] === SSE_SPACE) {
    payload = payload.subarray(1);
  }

  // Check for the [DONE] marker
  if (areArraysEqual(payload, SSE_DONE_MARKER)) {
    return null;
  }

  // Attempt to parse the payload as JSON, otherwise return it as text.
  return safeJson(payload) ?? dec.decode(payload);
};

export const ndjsonParser: Parser = safeJson;
export const textParser: Parser = dec.decode;