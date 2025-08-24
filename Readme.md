# Stretto

Stretto is a high-performance, resilient streaming HTTP client for fetching and parsing streams in TypeScript environments (browser, Deno, or Node.js with fetch support). It excels at handling Server-Sent Events (SSE), NDJSON, JSON, and plain text streams with built-in retries, timeouts, middleware, and efficient buffering to minimize memory usage.

Designed for low-latency, high-throughput applications, Stretto uses a ring buffer for line processing and supports custom parsers, backoff strategies, and throttling for consumer control.

## Features

- **Streaming Support**: Async iterable for real-time chunk processing.
- **Parsers**: Built-in support for SSE, NDJSON, JSON, and text. Custom parsers via the `Parser` interface.
- **Resilience**: Automatic retries with customizable backoff (default: exponential with jitter).
- **Timeouts & Abortion**: Per-attempt timeouts and AbortController integration.
- **Middleware**: Chainable middleware for request modification (e.g., auth, logging).
- **Efficient Buffering**: Ring buffer to avoid reallocations during line splitting.
- **Decompression**: Automatic handling of gzip, deflate, and brotli via `DecompressionStream`.
- **Throttling**: Optional delay between yielding chunks to the consumer.
- **Type-Safe**: Generic types for parsed output.

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

Stretto returns an async iterable that you can consume with `for await...of`. It handles the stream parsing and yields parsed chunks.

### Basic Example (SSE Stream)

```ts
import { stretto } from "stretto";

async function main() {
  const stream = stretto("https://stream.wikimedia.org/v2/stream/recentchange");

  for await (const event of stream) {
    console.log(event); // Parsed SSE event (JSON or text fallback)
  }
}

main().catch(console.error);
```

### With Options (Retries, Custom Parser)

```ts
import { stretto, JsonParser } from "stretto";

const stream = stretto<{ id: string }>("https://api.example.com/stream", {
  retries: 5,
  timeout: 10000, // 10 seconds per attempt
  parser: JsonParser(), // Buffer entire response as single JSON
  backoffStrategy: (attempt) => 500 * attempt, // Linear backoff
});

for await (const item of stream) {
  console.log(item.id);
}
```

### Canceling the Stream

```ts
const stream = stretto("https://stream.wikimedia.org/v2/stream/recentchange");
const iterator = stream[Symbol.asyncIterator]();

setTimeout(() => stream.cancel(), 5000); // Abort after 5 seconds

for await (const chunk of iterator) {
  console.log(chunk);
}
```

## API

### `stretto<T>(url: string | URL, opts: Opts<T>): Stretto<T>`

Creates a streaming request.

- `url`: The endpoint to fetch.
- `opts`: Configuration object (see Options below).
- Returns: An object with `[Symbol.asyncIterator]()` for streaming and `cancel()` to abort.

### Parsers

Exportable parser factories:

- `DefaultParser<T>()`: Handles SSE with JSON fallback, or NDJSON/text for non-SSE lines.
- `SseParser<T>()`: Strict SSE parser, yields JSON or text for `data:` lines.
- `NdjsonParser<T>()`: Parses each line as JSON.
- `JsonParser<T>()`: Buffers entire stream as single JSON object.
- `TextParser()`: Yields each line as string.

Custom parsers implement the `Parser<T>` interface:

```ts
interface Parser<T> {
  parse(chunk: Uint8Array): T | null;
  flush(): T | null;
}
```

### Options (`Opts<T>`)

- `body?: BodyInit | object`: Request body (JSON-stringified if object).
- `retries?: number`: Max retry attempts (default: 3).
- `timeout?: number`: Timeout per attempt in ms (default: 30,000).
- `parser?: Parser<T>`: Custom parser (default: `DefaultParser()`).
- `bufferSize?: number`: Ring buffer size for line processing (default: 64KB).
- `middleware?: Middleware[]`: Array of middleware functions.
- `backoffStrategy?: BackoffStrategy`: Retry delay calculator (default: exponential with jitter).
- `throttleMs?: number`: Delay between yielding chunks (default: none).
- Other `RequestInit` options (headers, method, etc.), excluding body/signal.

### Middleware

Middleware functions modify the request:

```ts
type Middleware = (req: Request, next: (req: Request) => Promise<Response>) => Promise<Response>;
```

Example (add auth):

```ts
const authMiddleware: Middleware = (req, next) => {
  req.headers.set("Authorization", "Bearer token");
  return next(req);
};
```

### Backoff Strategy

```ts
type BackoffStrategy = (attempt: number) => number; // ms delay
```

Use `defaultBackoff` for exponential jitter.

## Examples

### NDJSON Stream

```ts
import { stretto, NdjsonParser } from "stretto";

const stream = stretto("https://example.com/ndjson", { parser: NdjsonParser<{ name: string }>() });

for await (const { name } of stream) {
  console.log(name);
}
```

### Handling Errors

Errors (e.g., network failures beyond retries) are thrown in the loop. Use try-catch inside `for await`.

### Throttling Consumption

```ts
const stream = stretto("https://fast-stream.example.com", { throttleMs: 100 }); // Yield every 100ms
```

## Contributing

Pull requests welcome! Fork the repo, make changes, and submit a PR.

## License

MIT License. See [LICENSE](LICENSE) for details.
