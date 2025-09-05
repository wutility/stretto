export const DEFAULT_RETRIES = 3;
export const DEFAULT_TIMEOUT = 5000; // 5 seconds

// Pre-computed byte sequences (constants) for faster matching, avoiding string conversions in hot paths.
export const DATA_PREFIX = new Uint8Array([100, 97, 116, 97, 58]); // 'data:'
export const LF = 0x0a; // '\n'
export const MAX_BUFFER_SIZE = 16 * 1024 * 1024; // 16MB safety limit