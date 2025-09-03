export interface Parser<T> {
  parse(chunk: Uint8Array, controller: TransformStreamDefaultController<T | string>): void;
  flush(controller: TransformStreamDefaultController<T | string>): void;
}

export type BackoffStrategy = (attempt: number) => number;

export type RetryStrategy = (response: Response) => boolean;

export type StrettoStreamableResponse<T> = StrettoResponse & AsyncIterable<T | string>;

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