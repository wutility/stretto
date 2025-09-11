# Stretto

A lightweight, robust, and flexible HTTP client built on `fetch` for JSON streaming and non-streaming requests. Stretto simplifies API interactions with built-in support for streaming Server-Sent Events (SSE), automatic retries, timeouts, cancellation, and customizable transformations.

<div align="center" style="width:100%; text-align:center; margin-bottom:20px;">
  <img src="https://badgen.net/bundlephobia/minzip/stretto" alt="Bundle size" />
  <img src="https://badgen.net/bundlephobia/dependency-count/stretto" alt="Dependency count" />
  <img src="https://badgen.net/npm/v/stretto" alt="Version" />
  <img src="https://badgen.net/npm/dt/stretto" alt="Downloads" />
  <img src="https://data.jsdelivr.com/v1/package/npm/stretto/badge" alt="JSDelivr" />
</div>

<hr />

## [Demo](https://wutility.github.io/stretto)

## Features

- **Streaming Support**: Seamlessly iterate over JSON Server-Sent Events (SSE) using async iterables, optimized for high-throughput and secure parsing.
- **Automatic Retries**: Configurable retry logic with exponential backoff and jitter to handle transient errors (e.g., 429, 500, 503) and network failures.
- **Timeout Management**: Prevent hanging requests with per-request timeout controls, integrated with `AbortSignal` for graceful cancellation.
- **Cancellation Support**: Use `AbortSignal` to cancel requests at any time, with proper cleanup to avoid resource leaks.
- **Customizable Transformations**: Pipe response streams through custom `TransformStream` instances for flexible data processing.
- **Robust Error Handling**: Throws typed `HTTPError` for non-retryable HTTP errors and handles malformed SSE payloads securely.
- **Memory Efficiency**: Zero-copy operations and secure buffer management in SSE parsing for high-performance streaming.
- **Flexible Request Options**: Full control over HTTP methods, headers, and body parsing (JSON, text, blob, array buffer, form data).

## Installation

Install Stretto via npm:

```bash
npm install stretto
```

Or use the CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/stretto/dist/index.umd.min.js"></script>
<!-- window.stretto is available -->
```

## Usage

### Basic Non-Streaming Request

Fetch data and parse it as JSON:

```typescript
import stretto from "stretto";

async function fetchData() {
  try {
    const response = await stretto("https://jsonplaceholder.typicode.com/todos/1");
    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error("Fetch failed:", error);
  }
}

fetchData();
```

### Advanced Configuration

Customize retries, timeouts, headers, and retry conditions:

```typescript
import stretto from "stretto";

async function fetchWithOptions() {
  try {
    const response = await stretto("https://jsonplaceholder.typicode.com/todos/1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "value" }),
      retries: 3,
      timeout: 5000,
      backoffStrategy: (attempt) => Math.min(100 * (1 << attempt), 5000), // Exponential backoff with jitter
      retryOn: (error, response) => {
        // Retry on specific status codes or network errors
        return response?.status === 429 || error instanceof TypeError;
      },
    });
    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error("Fetch failed:", error);
  }
}

fetchWithOptions();
```

### Streaming Server-Sent Events (SSE)

Process JSON SSE streams with cancellation:

```typescript
import stretto, { JSONStreamTransformer } from "stretto";

async function streamData() {
  const controller = new AbortController();
  try {
    const stream = await stretto("https://sse.dev/test", {
      stream: true,
      signal: controller.signal,
      transformers: [
        new JSONStreamTransformer({
          maxBuffer: 16384, // Handle larger SSE lines
          onBufferOverflow: "throw", // Fail fast on oversized lines
          onParseError: "skip", // Skip invalid JSON payloads
        }),
      ],
    });

    let counter = 0;
    for await (const chunk of stream) {
      console.log("Chunk:", chunk);
      counter++;
      if (counter > 2) controller.abort(); // Cancel after 3 chunks
    }
  } catch (error) {
    console.error("Stream failed:", error);
  }
}

streamData();
```

## API Reference

### `stretto(url: string | URL, options?: StrettoOptions): Promise<StrettoStreamableResponse>`

The main function to make HTTP requests with streaming and retry capabilities.

#### Parameters
- `url`: The URL to fetch (string or `URL` object).
- `options`: Configuration object (see `StrettoOptions` below).

#### Returns
- A `Promise` resolving to a `StrettoStreamableResponse`, which extends the native `Response` with async iterable capabilities for streaming.

### Types

#### `StrettoOptions`

Configuration options for a Stretto request:

```typescript
interface StrettoOptions extends Omit<RequestInit, "signal"> {
  /** Maximum number of retry attempts. Defaults to 3. */
  retries?: number;
  /** Timeout in milliseconds for the request. Defaults to 30000 (30s). */
  timeout?: number;
  /** Function to calculate backoff delay (ms) for retries. */
  backoffStrategy?: (attempt: number) => number;
  /** Function to determine if a request should be retried. */
  retryOn?: (error: unknown, response?: Response) => boolean;
  /** Enable streaming mode. Defaults to false. */
  stream?: boolean;
  /** Array of TransformStream instances to process the response stream. */
  transformers?: TransformStream<any, any>[];
  /** AbortSignal for external cancellation. */
  signal?: AbortSignal;
}
```

#### `JSONStreamOptions`

Configuration for the `JSONStreamTransformer`:

```typescript
interface JSONStreamOptions {
  /** Maximum size in bytes for an SSE line. Defaults to 8192. */
  maxBuffer?: number;
  /** String that terminates the stream when received as a data payload. */
  donePrefix?: string;
  /** Whether to parse JSON payloads (true) or output as strings (false). Defaults to true. */
  parseData?: boolean;
  /** Handling for lines exceeding maxBuffer: "skip" (default) or "throw". */
  onBufferOverflow?: "skip" | "throw";
  /** Handling for invalid JSON payloads: "skip" (default) or "throw". */
  onParseError?: "skip" | "throw";
}
```

#### `HTTPError`

Custom error class for HTTP errors:

```typescript
class HTTPError extends Error {
  readonly response: Response;
  constructor(response: Response);
}
```

#### `StrettoStreamableResponse<T>`

A `Response` object augmented with async iterable capabilities:

```typescript
type StrettoStreamableResponse<T> = Response & AsyncIterable<T>;
```

### `JSONStreamTransformer`

A `TransformStream` for parsing JSON Server-Sent Events (SSE) with high performance and security:

```typescript
class JSONStreamTransformer extends TransformStream<Uint8Array, any> {
  constructor(options?: JSONStreamOptions);
}
```

- **Security**: Clears internal buffers on completion to prevent data leaks.
- **Performance**: Uses zero-copy operations and native `indexOf` for line parsing.
- **Robustness**: Handles malformed input, buffer overflows, and various line endings gracefully.

## Contributing

Contributions are welcome! To contribute:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m "Add your feature"`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

Please ensure your code follows the existing style and includes tests where applicable.

## License

Stretto is licensed under the [MIT License](LICENSE).
