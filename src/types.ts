/** A custom error class for HTTP errors, containing the full Response object. */
export class HTTPError extends Error {
  public readonly response: Response;

  constructor(response: Response) {
    super(`HTTP Error: ${response.status} ${response.statusText}`);
    this.name = "HTTPError";
    this.response = response;
  }
}

/** The Response object, augmented with async iterable capabilities. */
export type StrettoStreamableResponse<T> = Response & AsyncIterable<T>;

/** Configuration options for a Stretto request. */
export interface StrettoOptions<T> extends Omit<RequestInit, "signal"> {
  /** The maximum number of retry attempts. Defaults to 3. */
  retries?: number;
  /** The timeout in milliseconds for the entire request, including retries. Defaults to 30000. */
  timeout?: number;
  /** * A function that calculates the backoff delay before a retry.
   * @param {number} attempt The current retry attempt number.
   */
  backoffStrategy?: (attempt: number) => number;
  /** * A function to determine if a request should be retried.
   * @param {unknown} error The error caught during the fetch attempt.
   * @param {Response} [response] The response object if the request completed.
   */
  retryOn?: (error: unknown, response?: Response) => boolean;
  /** Set to true to enable response streaming. Defaults to false. */
  stream?: boolean;
  /** An array of TransformStream instances to pipe the response through. */
  transformers?: TransformStream<any, any>[];
  /** An optional AbortSignal to allow for external cancellation of the request. */
  signal?: AbortSignal;
}
