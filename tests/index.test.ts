import stretto from '../src/index';

describe('stretto - non-stream', () => {
  const BASE = 'https://jsonplaceholder.typicode.com';

  it('resolves to a normal response object', async () => {
    const res = await stretto(`${BASE}/posts/1`);
    const data = await res.json();
    const id = (data as any).id as number;
    expect(id).toBe(1);
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