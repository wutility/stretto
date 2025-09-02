/** An interface for a stateful parser that processes byte chunks. */
export interface Parser<T = unknown> {
  parse(chunk: Uint8Array): T | null;
  flush(): T | null;
}

// --- Middleware Types ---
export type Next = (request: Request) => Promise<Response>;
export type Middleware = (request: Request, next: Next) => Promise<Response>;

/** A function that calculates the backoff delay for retries. */
export type BackoffStrategy = (attempt: number) => number;

/** Configuration options for a Stretto stream request. */
export type Opts<T = unknown> = Omit<RequestInit, 'body' | 'signal'> & {
  body?: BodyInit | object;
  retries?: number;
  timeout?: number;
  parser?: Parser<T>;
  bufferSize?: number;
  middleware?: Middleware[];

  /** A function to calculate retry delay in ms. Defaults to exponential backoff with jitter. */
  backoffStrategy?: BackoffStrategy;
  /** Milliseconds to wait between yielding each chunk to the consumer. */
  throttleMs?: number;
};