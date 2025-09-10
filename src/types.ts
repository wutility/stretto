// src/types.ts
export interface StrettoOptions<T> extends RequestInit {
  /** * Number of retry attempts.
   * @default 3
   */
  retries?: number;
  /** * Timeout in milliseconds for each attempt.
   * @default 30000
   */
  timeout?: number;
  /** * A function to calculate the delay between retries.
   */
  backoffStrategy?: (attempt: number) => number;
  /** * A function to determine if a failed request should be retried.
   */
  retryOn?: (error: unknown, response?: Response) => boolean;
  /** * Set to true to process the response as a stream.
   * @default false
   */
  stream?: boolean;
  /**
   * An array of TransformStream instances to pipe the response body through.
   * Defaults to an empty array for a raw `Uint8Array` stream.
   */
  transformers?: TransformStream<Uint8Array, T>[];
}

/**
 * A native `Response` object that is also an `AsyncIterable`.
 * This allows you to check `res.status` and then directly iterate the body with `for await...of`.
 */
export type StrettoStreamableResponse<T> = Response & AsyncIterable<T>;
