export const DEFAULT_RETRIES = 3;
export const DEFAULT_TIMEOUT = 30_000; // 30 seconds

// Common byte values
export const CR = 0x0d; // Carriage Return
export const LF = 0x0a; // Line Feed
export const COLON = 0x3a;
export const SPACE = 0x20;

// Pre-encoded Server-Sent Events (SSE) prefixes for faster parsing
export const decoder = new TextDecoder();
export const encoder = new TextEncoder();
export const SSE_DATA_PREFIX = encoder.encode('data:');
export const SSE_EVENT_PREFIX = encoder.encode('event:');
export const SSE_ID_PREFIX = encoder.encode('id:');

// Constants for the backoff strategy to improve readability
export const INITIAL_BACKOFF_MS = 100;
export const MAX_BACKOFF_MS = 5000;
export const EXPONENTIAL_BASE = 2;
export const JITTER_FACTOR = 0.5;