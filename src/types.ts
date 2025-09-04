export interface Parser<T> {
  parse(chunk: Uint8Array, controller: TransformStreamDefaultController<T>): void;
  flush(controller: TransformStreamDefaultController<T>): void;
  reset(): void;
}

export type BackoffStrategy = (attempt: number) => number;

/**
 * A strategy function that determines if a request should be retried.
 * @param response The Response object from the failed attempt.
 * @param options The original request options, useful for checking the HTTP method.
 */
export type RetryStrategy = (response: Response, options: StrettoOpts) => boolean;

/**
 * The response object returned by stretto.
 * It mirrors the standard Response API but adds async iteration for streaming.
 */
export type StrettoStreamableResponse<T> = Response & AsyncIterable<T>;

export interface StrettoOpts<T = unknown> extends Omit<RequestInit, 'body' | 'signal' | 'method' | 'headers'> {
  body?: BodyInit | Record<string, unknown>;
  headers?: HeadersInit;
  method?: string;
  retries?: number;
  timeout?: number;
  signal?: AbortSignal;
  backoffStrategy?: BackoffStrategy;
  retryOn?: RetryStrategy;
  stream?: boolean;
  parser?: Parser<T>;
  strictJson?: boolean;
}