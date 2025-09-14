import stretto from '../mod';

describe('stretto - non-stream: network errors', () => {
  it('should throw on network error (e.g., DNS failure)', async () => {
    await expect(stretto('http://non-existent-domain-123.com')).rejects.toThrow();
  });
});

describe('stretto - non-stream', () => {
  const BASE = 'https://jsonplaceholder.typicode.com';

  it('resolves to a normal response object', async () => {
    const res = await stretto(`${BASE}/posts/1`);
    const data = await res.json();
    expect(res.ok).toBe(true);
  });
});

describe('stretto - SSE stream wikimedia', () => {
  it('iterates recent changes from Wikimedia SSE endpoint', async () => {
    const url = 'https://stream.wikimedia.org/v2/stream/recentchange';
    const res = await stretto(url, { stream: true, timeout: 15000 }); // 15s timeout
    let count = 0;
    for await (const item of res) {
      count++;
      if (count >= 3) break;
    }
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('handles SSE streaming from other public endpoints', async () => {
    const url = 'https://stream.wikimedia.org/v2/stream/recentchange';
    const res = await stretto(url, { stream: true, timeout: 15000 });
    const received: Array<any> = [];
    for await (const event of res) {
      received.push(event);
      if (received.length > 2) break;
    }
    expect(received.length).toBeGreaterThanOrEqual(1);
  });
});

describe('stretto - SSE stream httpbin', () => {
  it('delay 1s < timeout 3s', async () => {
    const res = await stretto('https://httpbin.org/delay/1', { stream: false, timeout: 7000 });
    expect(res.ok).toBe(true);
  });

  it('should timeout a slow stream', async () => {
    await expect(stretto('https://httpbin.org/delay/5', { stream: true, timeout: 1000 })).rejects.toThrow(/timeout/);
  });

  it('iterates through a stream that closes without error', async () => {
    const res = await stretto('https://httpbin.org/stream/3', { stream: true });
    let count = 0;
    for await (const item of res) {
      expect(item).toBeDefined();
      count++;
    }
    expect(res.ok).toBe(true);
  });
});

describe('stretto - AbortController', () => {
  it('should abort a request before completion', async () => {
    const controller = new AbortController();
    const promise = stretto('https://httpbin.org/delay/5', { signal: controller.signal, retries: 1 });
    setTimeout(() => controller.abort(), 300);
    await expect(promise).rejects.toThrow(/aborted/i);
  });

  it('should not abort if controller not triggered', async () => {
    const controller = new AbortController();
    const res = (await stretto('https://httpbin.org/delay/1', { signal: controller.signal, }));
    expect(res.ok).toBe(true);
  });
});