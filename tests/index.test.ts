import stretto from '../src/index';

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
    const id = (data as any).id as number;
    expect(id).toBe(1);
  });
});

describe('stretto - non-stream: errors', () => {
  it('should throw 500 (Internal Server Error)', async () => {
    await expect(stretto('https://httpbin.org/status/500')).rejects.toThrow(/500/);
  });

  it('should throw 404 (Not Found)', async () => {
    await expect(stretto('https://httpbin.org/status/404')).rejects.toThrow(/404/);
  });

  it('should throw 400 (Bad Request)', async () => {
    await expect(stretto('https://httpbin.org/status/400')).rejects.toThrow(/400/);
  });

  it('should throw 401 (Unauthorized)', async () => {
    await expect(stretto('https://httpbin.org/status/401')).rejects.toThrow(/401/);
  });

  it('should throw 403 (Forbidden)', async () => {
    await expect(stretto('https://httpbin.org/status/403')).rejects.toThrow(/403/);
  });
});

describe('stretto - SSE stream httpbin', () => {
  it('delay 3s < timeout 5s', async () => {
    const res = await stretto('https://httpbin.org/delay/3', { timeout: 5000 });
    expect(res.ok).toBe(true);
  });

  it('should timeout a slow stream', async () => {
    await expect(stretto('https://httpbin.org/delay/5', { stream: true, timeout: 2000 })).rejects.toThrow(/Request timed out/);
  });

  it('iterates through a stream that closes without error', async () => {
    const res = await stretto('https://httpbin.org/stream/3', { stream: true });
    let count = 0;
    for await (const item of res) {
      expect(item).toBeDefined();
      count++;
    }
    expect(count).toBe(3);
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