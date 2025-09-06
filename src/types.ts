// src/types.ts

/**
 * A strategy function to determine if a request should be retried based on the response.
 * @param res The Response object from the failed attempt.
 * @returns `true` to retry, `false` to fail immediately.
 */
export type RetryStrategy = (res: Response) => boolean;

/**
 * A strategy function to calculate the delay before the next retry attempt.
 * @param attempt The current retry attempt number (starting from 0).
 * @returns The delay in milliseconds.
 */
export type BackoffStrategy = (attempt: number) => number;

/**
 * Defines the options for a stretto request.
 */
export interface StrettoOptions<T> extends RequestInit {
  /** Number of retry attempts. Defaults to 3. */
  retries?: number;
  /** Timeout in milliseconds for each attempt. Defaults to 5000. */
  timeout?: number;
  /** A function to calculate the delay between retries. */
  backoffStrategy?: BackoffStrategy;
  /** A function to determine if a failed request should be retried. */
  retryOn?: RetryStrategy;
  /** Set to true to process the response as a stream. Defaults to false. */
  stream?: boolean;
  /** If true, throws an error on invalid JSON in a stream. Defaults to true. */
  strictJson?: boolean;
  /**
   * A custom TransformStream to parse the response body.
   * If `undefined` (default), uses a high-performance SSE parser for streams.
   * If `null`, provides a raw `Uint8Array` stream.
   */
  parser?: TransformStream<Uint8Array, T> | null;

  includeEventAndId?: boolean;
  minBufferSize?: number;
  maxBufferSize?: number;

  onStreamError?: (error: Error, rawData?: Uint8Array) => void;
}

/**
 * A native `Response` object that is also an `AsyncIterable`.
 * This allows you to check `res.status` and then directly iterate the body with `for await...of`.
 */
export type StrettoStreamableResponse<T> = Response & AsyncIterable<T>;
