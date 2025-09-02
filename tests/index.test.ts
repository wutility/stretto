import stretto from '../src/index';
import { StrettoStreamableResponse } from '../src/types';

describe('stretto – non-stream', () => {
  const BASE = 'https://jsonplaceholder.typicode.com';

  it('resolves to a normal response object', async () => {
    const res = await stretto(`${BASE}/posts/1`);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/json/);
  });

  it('parses JSON via .json()', async () => {
    const res = await stretto(`${BASE}/posts/1`);
    const body = await res.json();
    expect(body).toHaveProperty('id', 1);
    expect(body).toHaveProperty('title');
  });

  it('reads text via .text()', async () => {
    const res = await stretto(`${BASE}/posts/1`);
    const text = await res.text();
    expect(text).toMatch(/"id"\s*:\s*1/);
  });

  it('respects method & body', async () => {
    const res = await stretto(`${BASE}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { title: 'foo', body: 'bar', userId: 1 },
    });
    const body = await res.json();
    // @ts-ignore: Unreachable code error
    expect(body.title).toBe('foo');
  });
});

