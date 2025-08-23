# Stretto

Stretto is a high-performance TypeScript library for streaming HTTP requests with support for Server-Sent Events (SSE), NDJSON, and custom data formats. It processes streams at the byte level to minimize overhead, supports retry logic with exponential backoff, and provides flexible parsing for various data formats. Stretto is designed for efficient, reliable, and customizable streaming in modern web applications.

## Features

- **Byte-Level Stream Processing**: Processes incoming data at the byte level to avoid unnecessary string conversions, ensuring high performance.
- **Server-Sent Events (SSE) Support**: Built-in parser for SSE streams, handling `data:` prefixes and `[DONE]` markers.
- **NDJSON and Text Parsing**: Includes parsers for NDJSON (JSON-per-line) and plain text streams.
- **Custom Parser Chaining**: Chain multiple parsers to process complex data formats.
- **Retry Logic**: Configurable retry mechanism with exponential backoff and jitter for robust error handling.
- **Abort Signal Support**: Integrates with `AbortController` for fine-grained cancellation control.
- **Interceptors**: Modify `Request` and `Response` objects before processing for advanced customization.
- **Type-Safe**: Fully typed with TypeScript for a reliable developer experience.

<div align="center" style="width:100%; text-align:center; margin-bottom:20px;">
  <img src="https://badgen.net/bundlephobia/minzip/stretto" alt="stretto" />
  <img src="https://badgen.net/bundlephobia/dependency-count/stretto" alt="stretto" />
  <img src="https://badgen.net/npm/v/stretto" alt="stretto" />
  <img src="https://badgen.net/npm/dt/stretto" alt="stretto" />
  <img src="https://data.jsdelivr.com/v1/package/npm/stretto/badge" alt="stretto"/>
</div>

<hr />

## [Demo](https://wutility.github.io/stretto)

## Installation

Install Stretto via npm:

```bash
npm install stretto
```

Or use it via a CDN (e.g., for browser environments):

```html
<script type="module" src="https://unpkg.com/stretto"></script>
```

## Usage

### Basic SSE Streaming

Stream Server-Sent Events from Wikimedia's EventStreams service (e.g., recent Wikipedia edits):

```typescript
import { stretto, sseParser } from 'stretto';

const stream = stretto('https://stream.wikimedia.org/v2/stream/recentchange', {
  parser: sseParser,
});

for await (const event of stream) {
  console.log('Recent Wikipedia change:', event);
}

// Cancel the stream when done
stream.cancel();
```

### NDJSON Streaming

Stream NDJSON data from Wikimedia's EventStreams and parse each line as JSON:

```typescript
import { stretto, ndjsonParser } from 'stretto';

const stream = stretto('https://stream.wikimedia.org/v2/stream/recentchange', {
  parser: ndjsonParser,
});

for await (const data of stream) {
  console.log('Parsed Wikipedia event:', data);
}
```

### Non-Streaming JSON Response

Handle a standard JSON API response (e.g., a hypothetical Wikimedia API endpoint):

```typescript
import { stretto, ndjsonParser } from 'stretto';

const api = stretto('https://api.wikimedia.org/core/v1/wikipedia/en/page/Main_Page', {
  parser: ndjsonParser, // Parses JSON response
});

for await (const data of api) {
  console.log('Page data:', data);
}
```

### Custom Parser Chaining

Chain parsers to process Wikimedia's EventStreams data, e.g., extracting specific fields:

```typescript
import { stretto, chainParsers, sseParser } from 'stretto';

// Example: Parse SSE and extract the 'title' field
const titleParser = chainParsers([
  sseParser,
  (input: any) => input?.title || null,
]);

const stream = stretto('https://stream.wikimedia.org/v2/stream/recentchange', {
  parser: titleParser,
});

for await (const title of stream) {
  if (title) console.log('Article title:', title);
}
```

### Retry Configuration

Configure retries for robust streaming from Wikimedia's EventStreams:

```typescript
import { stretto, sseParser } from 'stretto';

const stream = stretto('https://stream.wikimedia.org/v2/stream/recentchange', {
  parser: sseParser,
  retries: 5,
  retryDelay: 1000, // Start with 1-second delay
  maxRetryDelay: 15000, // Cap at 15 seconds
});

for await (const event of stream) {
  console.log('Recent Wikipedia change:', event);
}
```

### Request and Response Interceptors

Add custom headers or log responses for Wikimedia's EventStreams:

```typescript
import { stretto, sseParser } from 'stretto';

const stream = stretto('https://stream.wikimedia.org/v2/stream/recentchange', {
  parser: sseParser,
  onRequest: async (req) => {
    req.headers.set('User-Agent', 'Stretto-Example/1.0');
    return req;
  },
  onResponse: async (res) => {
    console.log('Response status:', res.status);
    return res;
  },
});

for await (const event of stream) {
  console.log('Recent Wikipedia change:', event);
}
```

## API

### `stretto(url: string | URL, opts?: Opts<T>): StrettoEvents<T>`

Creates a streaming or non-streaming request with the specified URL and options.

- `url`: The URL to fetch data from.
- `opts`: Configuration options (see `Opts` type below).

Returns a `StrettoEvents<T>` object with:
- `[Symbol.asyncIterator](): AsyncIterator<T>`: Iterates over parsed stream chunks or a single parsed response for non-streaming APIs.
- `cancel(): void`: Cancels the request or stream and aborts the operation.

### `Opts<T>`

Configuration options for the `stretto` function:

- `parser?: Parser<T> | Parser<any>[]`: A single parser or array of parsers to process stream or response data.
- `body?: BodyInit | object`: Request body (JSON objects are automatically stringified).
- `headers?: Record<string, string>`: Custom headers for the request.
- `timeout?: number`: Request timeout in milliseconds (default: 30 seconds).
- `retries?: number`: Number of retry attempts (default: 3).
- `retryDelay?: number`: Initial retry delay in milliseconds (default: 500ms).
- `maxRetryDelay?: number`: Maximum retry delay in milliseconds (default: 10 seconds).
- `signal?: AbortSignal`: External `AbortSignal` to cancel the request.
- `retryStrategy?: RetryStrategy`: Custom retry logic function.
- `bufferSize?: number`: Size of the internal line buffer in bytes for streaming (default: 64KB).
- `onRequest?: (request: Request) => Request | Promise<Request>`: Interceptor to modify the `Request`.
- `onResponse?: (response: Response) => Response | Promise<Response>`: Interceptor to modify the `Response`.

### Parsers

- `sseParser`: Parses Server-Sent Events (SSE) streams, handling `data:` prefixes and `[DONE]` markers.
- `ndjsonParser`: Parses NDJSON (JSON-per-line) streams or single JSON responses.
- `textParser`: Decodes raw text from an `ArrayBuffer`.

### Utilities

- `chainParsers<T>(parsers: Parser<any>[]): Parser<T>`: Chains multiple parsers to process data sequentially.
- `withRetries<T>(opts: RetryOpts, factory: (signal: AbortSignal) => AsyncGenerator<T>): AsyncGenerator<T>`: Wraps a stream or request with retry logic.
- `anySignal(...signals: (AbortSignal | undefined)[]): AbortSignal`: Combines multiple `AbortSignal`s into a single signal.
- `sleep(ms: number): Promise<void>`: Pauses execution for the specified duration.

## Types

- `Parser<T>`: A function that parses an `ArrayBuffer` and returns a typed result or `null`.
- `RetryStrategy`: A function that determines the retry delay based on the attempt number and error.
- `RetryOpts`: Options for configuring retries.
- `Opts<T>`: Configuration options for the `stretto` function.

## Error Handling

Stretto automatically retries failed requests based on the configured retry strategy. If the maximum retries are exceeded or the request/stream is aborted, an error is thrown. Use `try/catch` to handle errors:

```typescript
try {
  const stream = stretto('https://stream.wikimedia.org/v2/stream/recentchange');
  for await (const event of stream) {
    console.log('Recent Wikipedia change:', event);
  }
} catch (err) {
  console.error('Stream failed:', err);
}
```

## Browser Compatibility

Stretto relies on modern web APIs (`fetch`, `ReadableStream`, `DecompressionStream`, `AbortController`) and has **no external dependencies**. It is compatible with:
- Modern browsers (Chrome, Edge, Firefox, Safari).
- Node.js 18+ with `fetch` support.
- Deno and other environments supporting web-standard APIs.

For older environments, you may need polyfills for `fetch` or `DecompressionStream`.

## Contributing

Contributions are welcome! To contribute:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m 'Add your feature'`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

Please include tests and update documentation as needed.

## License

Stretto is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.