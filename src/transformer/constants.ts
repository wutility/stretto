// Hexadecimal constants for SSE line parsing
export const NEWLINE = 0x0a; // \n
export const CARRIAGE_RETURN = 0x0d; // \r
export const DATA_PREFIX_LEN = 6; // "data: "

export const decoder = new TextDecoder();
export const encoder = new TextEncoder();