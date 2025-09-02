# Stretto

A lightweight, flexible HTTP client library for making streaming and non-streaming requests in TypeScript/JavaScript environments. Stretto simplifies fetching data from APIs with support for streaming responses, retry mechanisms, and customizable request options.

## Features

- **Streaming Support**: Iterate over response data as it arrives using async iterables.
- **Type-Safe Responses**: Strongly typed responses for better developer experience.
- **Retry Mechanism**: Configurable retries with custom backoff strategies.
- **Timeout Handling**: Set timeouts to prevent hanging requests.
- **Cancellation Support**: Use `AbortSignal` to cancel requests.
- **Flexible Body Parsing**: Supports JSON, text, blob, array buffer, and form data.
- **Customizable Headers and Methods**: Full control over HTTP headers and methods.

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

```html
<script src="https://cdn.jsdelivr.net/npm/stretto@1.0.4/dist/index.umd.min.js"></script>
<!-- window.stretto -->
```

## Usage

### Basic Non-Streaming Request

Make a simple HTTP request and parse the response as JSON:

```typescript
import stretto from 'stretto';

async function fetchData() {
  const response = await stretto('https://api.example.com/data');
  const data = await response.json();
  console.log(data);
}

fetchData();
```

### Streaming Response

Enable streaming to process data chunks as they arrive:

```typescript
import stretto from 'stretto';

async function streamData() {
  const response = await stretto('https://stream.wikimedia.org/v2/stream/recentchange', { stream: true });
  for await (const chunk of response) {
    console.log(chunk);
  }
}

streamData();
```

### Advanced Options

Configure retries, timeouts, and custom headers:

```typescript
import stretto from 'stretto';

async function fetchWithOptions() {
  const response = await stretto('https://api.example.com/data', {
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

### `stretto(url: string | URL, options?: StrettoOpts): Promise<StrettoStreamableResponse<T>>`

Fetches data from the specified URL with optional configuration.

#### Parameters

- `url`: The URL to fetch (string or `URL` object).
- `options`: Configuration options (`StrettoOpts`):
  - `body`: Request body (`BodyInit` or object for JSON).
  - `headers`: Custom headers (`HeadersInit`).
  - `method`: HTTP method (e.g., `'GET'`, `'POST'`).
  - `retries`: Number of retry attempts.
  - `timeout`: Request timeout in milliseconds.
  - `signal`: `AbortSignal` for cancellation.
  - `backoffStrategy`: Function to calculate delay between retries.
  - `retryOn`: Function to determine if a retry should occur based on the response.
  - `stream`: Enable streaming mode (`true`/`false`, default: `false`).

#### Returns

A `StrettoStreamableResponse<T>` object with:
- Standard response properties: `headers`, `ok`, `status`, `statusText`, `url`.
- Body-consuming methods: `json()`, `text()`, `blob()`, `arrayBuffer()`, `formData()`.
- `body`: The raw `ReadableStream` (or `null`).
- Async iterable support when `stream: true`.

### Example with Cancellation

Use an `AbortController` to cancel a request:

```typescript
import stretto from 'stretto';

async function cancelableRequest() {
  const controller = new AbortController();
  const response = stretto('https://api.example.com/data', { signal: controller.signal });

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

### `StrettoOpts`

```typescript
interface StrettoOpts {
  body?: BodyInit | Record<string, unknown>;
  headers?: HeadersInit;
  method?: string;
  retries?: number;
  timeout?: number;
  signal?: AbortSignal;
  backoffStrategy?: (attempt: number) => number;
  retryOn?: (response: Response) => boolean;
  stream?: boolean;
}
```

### `StrettoStreamableResponse<T>`

Combines standard `Response` properties with async iterable support for streaming.

## Contributing

Contributions are welcome! Please submit issues or pull requests to the [GitHub repository](https://github.com/username/stretto).

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m "Add your feature"`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

## License

Stretto is licensed under the [MIT License](LICENSE).
