# Stretto 🚀

A robust, high-performance TypeScript fetch wrapper with built-in retry logic, exponential backoff, streaming capabilities, and Server-Sent Events (SSE) support.

- Memory Efficiency: Zero-copy streaming and buffer reuse keep memory usage low.
- Minimal Allocations: Optimized hot paths reduce overhead.
- Buffer Overflow Protection: Configurable limits prevent memory exhaustion attacks.
- Data Security: Internal buffers are zeroed out to avoid leaks in memory dumps.

<div align="center" style="width:100%; text-align:center; margin-bottom:20px;">
  <img src="https://badgen.net/bundlephobia/minzip/stretto" alt="Bundle size" />
  <img src="https://badgen.net/bundlephobia/dependency-count/stretto" alt="Dependency count" />
  <img src="https://badgen.net/npm/v/stretto" alt="Version" />
  <img src="https://badgen.net/npm/dt/stretto" alt="Downloads" />
  <img src="https://data.jsdelivr.com/v1/package/npm/stretto/badge" alt="JSDelivr" />
</div>

<hr />

## 📦 Installation

```shell
# npm
npm install stretto
# Deno
deno add jsr:@wutility/stretto
```

Or use the CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/stretto/dist/index.umd.min.js"></script>
<!-- window.stretto.default is available -->
```

## 🚀 Quick Start

### Basic Usage

```typescript
import stretto from 'stretto';
// jsr
// import stretto, { JSONStreamTransformer } from "jsr:@wutility/stretto";

// Simple GET request
const response = await stretto('https://jsonplaceholder.typicode.com/todos/1');
const data = await response.json();
```

### With Options

```typescript
const response = await stretto('https://api.example.com/data', {
  retries: 5,
  timeout: 10000,
  headers: {'Authorization': 'Bearer token'}
});
```

### Streaming Responses

```typescript
const response = await stretto('https://stream.wikimedia.org/v2/stream/recentchange', {
  stream: true
});

// Use as AsyncIterable
for await (const chunk of response) {
  console.log('Received chunk:', chunk);
}
```

### Server-Sent Events (SSE)

```typescript
import stretto, { JSONStreamTransformer } from 'stretto';

const response = await stretto('https://sse.dev/test', {
  stream: true,
  transformers: [new JSONStreamTransformer()]
});

for await (const event of response) {
  console.log('SSE Event:', event);
}
```

## 📖 API Reference

### `stretto(url, options?)`

Main function for making HTTP requests.

**Parameters:**
- `url: string | URL` - The URL to fetch
- `options?: StrettoOptions` - Configuration options

**Returns:** `Promise<StrettoStreamableResponse<T>>`

### StrettoOptions

```typescript
interface StrettoOptions extends Omit<RequestInit, 'signal'> {
  retries?: number;                    // Default: 3
  timeout?: number;                    // Default: 30000ms
  backoffStrategy?: (attempt: number) => number;
  retryOn?: (error: unknown, response?: Response) => boolean;
  stream?: boolean;                    // Default: false
  transformers?: TransformStream<any, any>[];
  signal?: AbortSignal;
}
```

### JSONStreamTransformer

A specialized transformer for parsing Server-Sent Events with JSON payloads.

```typescript
import { JSONStreamTransformer } from 'stretto';

const transformer = new JSONStreamTransformer({
  maxBuffer: 8192,        // Maximum line buffer size
  parseData: true,        // Parse JSON automatically
  donePrefix: '[DONE]',   // Custom termination marker
  onBufferOverflow: 'skip', // 'skip' | 'throw'
  onParseError: 'skip'      // 'skip' | 'throw'
});
```

## 🔧 Advanced Usage

### Custom Retry Strategy

```typescript
const response = await stretto('https://api.example.com/data', {
  retries: 5,
  retryOn: (error, response) => {
    // Custom retry logic
    if (response?.status === 429) return true; // Rate limited
    if (error instanceof TypeError) return true; // Network error
    return false;
  },
  backoffStrategy: (attempt) => {
    // Custom backoff: linear instead of exponential
    return attempt * 1000;
  }
});
```

### Request Cancellation

```typescript
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  const response = await stretto('https://api.example.com/data', {
    signal: controller.signal
  });
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request was cancelled');
  }
}
```

### Multiple Transform Streams

```typescript
import stretto, { JSONStreamTransformer } from 'stretto';

const response = await stretto('https://sse.dev/test', {
  stream: true,
  transformers: [new JSONStreamTransformer()]
});

for await (const chunk of stream) {}
```

## 📊 Performance Features

- **Zero-copy streaming**: No unnecessary data copying during stream processing
- **Optimized backoff**: Uses bitwise operations for fast exponential calculations
- **Memory efficient**: Reuses buffers and minimizes allocations
- **V8 optimized**: Takes advantage of JavaScript engine optimizations

## 🧪 Testing

```bash
npm test
```

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.
