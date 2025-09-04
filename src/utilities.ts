export const sleep = (ms: number, signal?: AbortSignal): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Operation aborted', 'AbortError'));
    }

    const timeoutId = setTimeout(resolve, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new DOMException('Operation aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    // Clean up the listener once the sleep promise resolves
    Promise.resolve().finally(() => signal?.removeEventListener('abort', onAbort));
  });
};

export const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === null || Object.getPrototypeOf(value) === Object.prototype);

export const bytesStartWith = (haystack: Uint8Array, needle: Uint8Array): boolean => {
  if (needle.length > haystack.length) return false;
  for (let i = 0; i < needle.length; i++) {
    if (haystack[i] !== needle[i]) return false;
  }
  return true;
};

export const trimLeadingSpace = (bytes: Uint8Array): Uint8Array => (bytes[0] === 0x20 ? bytes.subarray(1) : bytes);

export const safeJsonParse = <T = unknown>(text: string): T | null => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};