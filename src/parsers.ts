// parsers.ts

import { dec, SSE_DATA_PREFIX, SSE_EVENT_PREFIX, SSE_ID_PREFIX, COLON } from "./constants.ts";
import { Parser } from "./types.ts";
import { startsWith, trimLeadingSpace } from "./utilities.ts";

const safeJson = (text: string) => {
  try { return JSON.parse(text); }
  catch { return null; }
};

/**
 * Creates a parser that processes a stream as a single JSON object.
 * It buffers all incoming data and parses it as a whole when the stream ends.
 * Ideal for standard REST API endpoints that return a JSON body.
 */
export function JsonParser<T>(): Parser<T> {
  let buffer = '';
  return {
    parse(chunk: Uint8Array): T | null {
      buffer += dec.decode(chunk);
      return null; // Defer parsing until the end
    },
    flush(): T | null {
      if (!buffer) return null;
      const result = safeJson(buffer) as T | null;
      buffer = ''; // Reset state
      return result;
    },
  };
}

/**
 * Creates a parser that processes a stream as Newline Delimited JSON (NDJSON).
 * Each non-empty line is parsed as an independent JSON object.
 */
export function NdjsonParser<T>(): Parser<T> {
  return {
    parse(line: Uint8Array): T | null {
      if (line.length === 0) return null;
      return safeJson(dec.decode(line));
    },
    flush: () => null, // Stateless
  };
}

/**
 * Creates a parser that processes a stream as plain text, yielding each line.
 */
export function TextParser(): Parser<string> {
  return {
    parse(line: Uint8Array): string | null {
      return dec.decode(line);
    },
    flush: () => null, // Stateless
  };
}

/**
 * Creates a stateful parser that handles Server-Sent Events (SSE) and
 * attempts to parse the `data` payload as JSON, falling back to text.
 */
export function SseParser<T>(): Parser<T | string> {
  let data: string[] = [];

  const dispatch = (): T | string | null => {
    if (data.length === 0) return null;
    const dataStr = data.join("\n");
    data = []; // Reset state
    return (safeJson(dataStr) as T | null) ?? dataStr;
  };

  return {
    parse(line: Uint8Array): T | string | null {
      if (line.length === 0) {
        return dispatch(); // SSE message boundary
      }
      if (startsWith(line, SSE_DATA_PREFIX)) {
        data.push(dec.decode(trimLeadingSpace(line.subarray(SSE_DATA_PREFIX.length))));
        return null;
      }
      // Ignore event, id, and comment lines
      if (startsWith(line, SSE_EVENT_PREFIX) || startsWith(line, SSE_ID_PREFIX) || line[0] === COLON) {
        return null;
      }
      return null; // Ignore any other lines in SSE mode
    },
    flush: dispatch,
  };
}

/**
 * Creates the default, multi-purpose parser.
 * It robustly handles SSE streams and falls back to NDJSON for other lines.
 * If a line is not valid JSON, it's returned as plain text, preventing data loss.
 */
export function DefaultParser<T>(): Parser<T | string> {
  let sseData: string[] = [];
  const dispatchSse = (): T | string | null => {
    if (sseData.length === 0) return null;
    const dataStr = sseData.join("\n");
    sseData = []; // Reset state
    return (safeJson(dataStr) as T | null) ?? dataStr;
  };

  return {
    parse(line: Uint8Array): T | string | null {
      if (line.length === 0) {
        return dispatchSse(); // SSE message boundary
      }

      // SSE lines (data, event, id, comments)
      if (startsWith(line, SSE_DATA_PREFIX)) {
        sseData.push(dec.decode(trimLeadingSpace(line.subarray(SSE_DATA_PREFIX.length))));
        return null;
      }
      if (startsWith(line, SSE_EVENT_PREFIX) || startsWith(line, SSE_ID_PREFIX) || line[0] === COLON) {
        return null;
      }
      
      // If we have pending SSE data, dispatch it before processing this line
      const pending = dispatchSse();
      if (pending) return pending;

      // Fallback: Treat the line as NDJSON or plain text
      const text = dec.decode(line);
      return (safeJson(text) as T | null) ?? text;
    },
    flush: dispatchSse,
  };
}