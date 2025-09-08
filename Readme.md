# Stretto

A lightweight, flexible fetch based HTTP client for streaming and non-streaming requests. Stretto makes it easy to fetch data from APIs with support for streaming responses, retries, timeouts, cancellation, and customizable request options.

## Features

- **Streaming Support:** Iterate over response data as it arrives using async iterables for SSE, NDJSON, and other line-based protocols.
- **Retry Mechanism:** Configurable retries with custom backoff strategies and retry conditions.
- **Timeout Handling:** Prevent hanging requests with built-in timeouts.
- **Cancellation Support:** Use `AbortSignal` to cancel requests at any time.
- **Flexible Body Parsing:** Supports JSON, text, blob, array buffer, and form data.
- **Customizable Headers & Methods:** Full control over HTTP headers and methods.
- **Low-level Stream Access:** Access and transform raw `ReadableStream` data.

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

Or use the CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/stretto/dist/index.umd.min.js"></script>
<!-- window.stretto is available -->
```

## Usage

### Basic Non-Streaming Request

Make a simple HTTP request and parse the response as JSON:

```typescript
import stretto from 'stretto';

async function fetchData() {
  const response = await stretto('https://jsonplaceholder.typicode.com/todos/1');
  const data = await response.json();
  console.log(data);
}

fetchData();
```

### Streaming Server-Sent Events (SSE)

Enable streaming to process data chunks as they arrive. This example uses Wikimedia's public SSE endpoint:

```typescript
import stretto from 'stretto';

async function streamRecentChanges() {
  const response = await stretto('https://stream.wikimedia.org/v2/stream/recentchange', { stream: true });
  let count = 0;
  for await (const event of response) {
    console.log(event);
    count++;
    if (count >= 5) break; // Only process 5 events for demo
  }
}

streamRecentChanges();
```

### Advanced Options

Configure retries, timeouts, and custom headers:

```typescript
import stretto from 'stretto';

async function fetchWithOptions() {
  const response = await stretto('https://jsonplaceholder.typicode.com/todos/1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { key: 'value' },
    retries: 3,
    timeout: 5000,
    backoffStrategy: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    retryOn: (response) => response.status === 429,
  });
  const data = await response.json();
  console.log(data);
}

fetchWithOptions();
```

## API

### stretto(url: string | URL, options?: StrettoOpts<T>): Promise<StrettoStreamableResponse<T>>

Fetches data from the specified URL with optional configuration.

### Example with Cancellation

Use an `AbortController` to cancel a request:

```typescript
import stretto from 'stretto';

async function cancelableRequest() {
  const controller = new AbortController();
  const response = stretto('https://jsonplaceholder.typicode.com/todos/1', { signal: controller.signal });

  setTimeout(() => controller.abort(), 2000); // Cancel after 2 seconds
  try {
    const data = await (await response).json();
    console.log(data);
  } catch (error) {
    console.error('Request failed or was canceled:', error);
  }
}

cancelableRequest();
```

## Types

### StrettoOpts<T>

```typescript
interface StrettoOpts<T = unknown> {
  body?: BodyInit | Record<string, unknown>;
  headers?: HeadersInit;
  method?: string;
  retries?: number;
  timeout?: number;
  signal?: AbortSignal;
  backoffStrategy?: (attempt: number) => number;
  retryOn?: (response: Response) => boolean;
  stream?: boolean;
  parser?: TransformStream<Uint8Array, T> | null;

  includeEventAndId?: boolean;
  minBufferSize?: number;
  maxBufferSize?: number;

  onStreamError?: (error: Error, rawData?: Uint8Array) => void;
}
```

### StrettoStreamableResponse<T>

Combines standard `Response` properties with async iterable support for streaming.

## Testing Streaming Endpoints

Here are example endpoints you can use for streaming tests:

- **Wikimedia Recent Changes SSE:**  
  `https://stream.wikimedia.org/v2/stream/recentchange`
- **Other Public SSE/NDJSON:**  
  You can use [demo.ndjson.org](https://demo.ndjson.org/) or other similar endpoints.

## Contributing

Contributions are welcome! Please submit issues or pull requests

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m "Add your feature"`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

# Resources
- [whatwg spec SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html)

## License

Stretto is licensed under the [MIT License](LICENSE).
