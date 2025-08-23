// types.ts

/** A function that parses an ArrayBuffer and returns a typed result or null. */
export type Parser<T = unknown> = (input: ArrayBuffer) => T | null;

/**
 * A function that determines the delay for the next retry attempt.
 * @param attempt The current attempt number (starting from 1).
 * @param error The error that caused the retry.
 * @returns The delay in milliseconds, or `null` to stop retrying.
 */
export type RetryStrategy = (attempt: number, error: Error) => number | null;

// A dedicated type for options related to the retry mechanism.
export type RetryOpts = {
  retries?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
  /** An external AbortSignal to cancel the entire operation, including retries. */
  signal?: AbortSignal;
  /** A custom function to control retry logic. Overrides other retry options. */
  retryStrategy?: RetryStrategy;
};

/** Configuration options for a Stretto stream request. */
export type Opts<T = unknown> = Omit<RequestInit, 'body' | 'signal'> & RetryOpts & {
  body?: BodyInit | object;
  timeout?: number;
  /** A single parser or an array of parsers to be chained. */
  parser?: Parser<T> | Parser<any>[];
  /** The size of the internal line buffer in bytes. Defaults to 64KB. */
  bufferSize?: number;
  /** An interceptor to modify the Request object before it is sent. */
  onRequest?: (request: Request) => Request | Promise<Request>;
  /** An interceptor to modify the Response object before it is processed. */
  onResponse?: (response: Response) => Response | Promise<Response>;
};