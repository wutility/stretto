# Stretto

A lightweight, flexible fetch based HTTP client for streaming and non-streaming
requests. Stretto makes it easy to fetch data from APIs with support for
streaming responses, retries, timeouts, cancellation, and customizable request
options.

## Features

- **Streaming Support:** Iterate over response data as it arrives using async
  iterables for SSE, NDJSON, and other line-based protocols.
- **Retry Mechanism:** Configurable retries with custom backoff strategies and
  retry conditions.
- **Timeout Handling:** Prevent hanging requests with built-in timeouts.
- **Cancellation Support:** Use `AbortSignal` to cancel requests at any time.
- **Flexible Body Parsing:** Supports JSON, text, blob, array buffer, and form
  data.
- **Customizable Headers & Methods:** Full control over HTTP headers and
  methods.
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
<script
  src="https://cdn.jsdelivr.net/npm/stretto/dist/index.umd.min.js"
></script>
<!-- window.stretto is available -->
```

## Usage

### Basic Non-Streaming Request

Make a simple HTTP request and parse the response as JSON:

```typescript
import stretto from "stretto";

async function fetchData() {
  const response = await stretto(
    "https://jsonplaceholder.typicode.com/todos/1",
  );
  const data = await response.json();
  console.log(data);
}

fetchData();
```

### Streaming Server-Sent Events (SSE)

Enable streaming to process data chunks as they arrive. This example uses
Wikimedia's public SSE endpoint:

```typescript
import stretto, { SSEStreamTransformer } from "stretto";

async function streamRecentChanges() {
  const response = await stretto(
    "https://stream.wikimedia.org/v2/stream/recentchange",
    {
      transformers: [new SSEStreamTransformer({ parseData: true })],
      stream: true,
    },
  );
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
import stretto from "stretto";

async function fetchWithOptions() {
  const response = await stretto(
    "https://jsonplaceholder.typicode.com/todos/1",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "value" }),
      retries: 3,
      timeout: 5000,
      backoffStrategy: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      retryOn: (response) => response.status === 429,
    },
  );
  const data = await response.json();
  console.log(data);
}

fetchWithOptions();
```

## Example with Cancellation

Use an `AbortController` to cancel a request:

```typescript
import stretto, { SSEStreamTransformer } from "stretto";

const controller = new AbortController();
const Origin = "https://stream.wikimedia.org/v2/stream/recentchange";
const stream = await stretto(Origin, {
  stream: true,
  method: "GET",
  signal: controller.signal,
  transformers: [
    new SSEStreamTransformer({
      parseData: true,
      bufferSize: 8 * 1024
    }),
  ],
});

let counter = 0;
for await (const chunk of stream) {
  counter++;
  if (counter > 1) controller.abort();
  console.log(counter, chunk, "\n");
}
```

```ts
import stretto, { JSONStreamTransformer } from "stretto";

const controller = new AbortController();
const stream = await stretto(
  `https://wise-dog-32.jimmy-wright.deno.net/llm/gemini`,
  {
    signal: controller.signal,
    stream: true,
    transformers: [new JSONStreamTransformer()],
  },
);

let counter = 0;
for await (const chunk of stream) {
  counter++;
  if (counter > 2) controller.abort();
  console.log("\nchunk ===> ", chunk);
}
```

## Types

### StrettoOptions<T>

```typescript
export interface StrettoOptions<T> extends RequestInit {
  /** Number of retry attempts. Defaults to 3. */
  retries?: number;
  /** Timeout in milliseconds for each attempt. Defaults to 5000. */
  timeout?: number;
  /** A function to calculate the delay between retries. */
  backoffStrategy?: (attempt: number) => number;
  /** A function to determine if a failed request should be retried. */
  retryOn?: (error: unknown, response?: Response) => boolean;
  /** Set to true to process the response as a stream. Defaults to false. */
  stream?: boolean;
  /**
   * A custom TransformStream to parse the response body.
   * If `null`, provides a raw `Uint8Array` stream.
   */
  transformers?: TransformStream<Uint8Array, T>[] | null;
}
```

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
