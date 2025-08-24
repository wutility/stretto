// constants.ts

// Default options
export const DEFAULT_RETRIES = 3;
export const DEFAULT_TIMEOUT = 30_000;
export const DEFAULT_BUFFER_SIZE = 64 * 1024; // 64KB

// Shared TextEncoder/Decoder instances
export const dec = new TextDecoder();
export const enc = new TextEncoder();

// Byte-level constants for parsing
export const CARRIAGE_RETURN = 0x0d; // '\r'
export const NEWLINE = 0x0a;         // '\n'
export const COLON = 0x3a;           // ':'
export const SPACE = 0x20;           // ' '

// "data:"
export const SSE_DATA_PREFIX = new Uint8Array([100, 97, 116, 97, 58]);
// "event:" - used for ignoring the line
export const SSE_EVENT_PREFIX = new Uint8Array([101, 118, 101, 110, 116, 58]);
// "id:" - used for ignoring the line
export const SSE_ID_PREFIX = new Uint8Array([105, 100, 58]);