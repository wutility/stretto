// constants.ts

// Default fetch options
export const DEFAULT_TIMEOUT = 30_000;
export const DEFAULT_RETRIES = 3;
export const DEFAULT_RETRY_DELAY = 500;
export const DEFAULT_MAX_RETRY_DELAY = 10_000;

// New: Default buffer size for line-based stream processing (64KB)
export const DEFAULT_BUFFER_SIZE = 64 * 1024;

// Shared utilities
export const dec = new TextDecoder();
export const enc = new TextEncoder();
export const reNL = /\r?\n/;