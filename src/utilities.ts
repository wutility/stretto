export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const INITIAL_BACKOFF_MS = 100;
const MAX_BACKOFF_MS = 5000;
const EXPONENTIAL_BASE = 2;

export const calculateBackoff = (attempt: number): number => {
  const exponentialDelay = INITIAL_BACKOFF_MS * (EXPONENTIAL_BASE ** attempt);
  const cappedDelay = Math.min(MAX_BACKOFF_MS, exponentialDelay);
  return Math.random() * cappedDelay; // Add jitter
};

export const shouldRetry = (error: unknown, response?: Response): boolean => {
  if (response) {
    const status = response.status;
    if (status >= 500 && status < 600 || [408, 429, 409].includes(status)) return true;
  }
  if (error instanceof Error) {
    // Do not retry on explicit user aborts
    if (error instanceof DOMException && error.name === "AbortError") {
      return false;
    }
    // For other errors, assume they are potentially transient network issues
    return true;
  }
  return false;
};

export const createTimeoutController = (timeoutMs: number, userSignal?: AbortSignal): { signal: AbortSignal; cleanup: () => void; } => {
  const controller = new AbortController();
  let timeoutId: any;

  const onUserAbort = () => controller.abort(userSignal?.reason);
  
  if (userSignal?.aborted) {
    onUserAbort();
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      controller.abort(new DOMException("Connection timeout", "TimeoutError"));
    }, timeoutMs);
  }

  userSignal?.addEventListener("abort", onUserAbort);

  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    userSignal?.removeEventListener("abort", onUserAbort);
  };

  return { signal: controller.signal, cleanup };
};