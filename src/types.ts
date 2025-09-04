export interface Parser<T> {
  /**
   * Parses a chunk of data (typically a line) and enqueues the result.
   * @param chunk The Uint8Array data to parse.
   * @param controller The stream controller to enqueue results to.
   */
  parse(chunk: Uint8Array, controller: TransformStreamDefaultController<T>): void;

  /**
   * Called when the stream is closing to flush any remaining buffered data.
   * @param controller The stream controller to enqueue results to.
   */
  flush(controller: TransformStreamDefaultController<T>): void;

  reset?(): void;
}

export type BackoffStrategy = (attempt: number) => number;

export type RetryStrategy = (result: Response | Error, attempt?: number) => boolean;

// The generic is now simplified to T for better type inference.
export type StrettoStreamableResponse<T> = StrettoResponse & AsyncIterable<T>;

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
  /** A custom parser for the streaming response. Defaults to an SSE parser. */
  parser?: Parser<T>;
  /** * If true, the default parser will throw an error on invalid JSON.
   * If false, it will silently drop the invalid line.
   * @default true
   */
  strictJson?: boolean;
  //maxResponseSize?: number;
}

export interface StrettoResponse {
  headers: Headers;
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  json: <T = unknown>() => Promise<T>;
  text: () => Promise<string>;
  blob: () => Promise<Blob>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  formData: () => Promise<FormData>;
  body: ReadableStream<Uint8Array> | null;
}