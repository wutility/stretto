// test-stretto.ts

import { stretto, JsonParser, NdjsonParser, SseParser } from '../dist/stretto';

// Utility to log test results
function logTest(name: string, success: boolean, details?: string) {
  console.log(`[${success ? 'PASS' : 'FAIL'}] ${name}${details ? `: ${details}` : ''}`);
}

// Test 1: Stream SSE from Wikimedia test endpoint
async function testSseStream() {
  try {
    const stream = stretto('https://stream.wikimedia.org/v2/stream/recentchange', { parser: SseParser() });
    let count = 0;

    for await (const chunk of stream) {
      console.log('SSE chunk:', chunk);
      count++;
      if (count >= 2) break; // Limit to 2 events for quick testing
    }

    logTest('SSE Stream', count > 0, `Received ${count} events`);
  } catch (err) {
    logTest('SSE Stream', false, err.message);
  }
}

// Test 2: Handle single JSON response with JsonParser
async function testJsonParser() {
  try {
    // Mock API returning JSON (using a public JSON endpoint)
    const stream = stretto('https://httpbin.org/json', { parser: JsonParser() });
    const results: any[] = [];

    for await (const chunk of stream) {
      results.push(chunk);
    }

    logTest('JSON Parser', results.length === 1 && !!results[0].slideshow, 'Parsed JSON object');
  } catch (err) {
    logTest('JSON Parser', false, err.message);
  }
}

// Test 3: Parse NDJSON stream
async function testNdjsonParser() {
  try {
    // Mock NDJSON response (using httpbin with a custom endpoint if available, or simulate)
    const stream = stretto('https://httpbin.org/stream/3', { parser: NdjsonParser() });
    const results: any[] = [];

    for await (const chunk of stream) {
      results.push(chunk);
    }

    logTest('NDJSON Parser', results.length > 0, `Parsed ${results.length} NDJSON objects`);
  } catch (err) {
    logTest('NDJSON Parser', false, err.message);
  }
}

// Test 4: Test cancel functionality
async function testCancel() {
  try {
    const stream = stretto('https://stream.wikimedia.org/v2/stream/test');
    const iterator = stream[Symbol.asyncIterator]();

    setTimeout(() => stream.cancel(), 1000); // Cancel after 1 second

    await iterator.next(); // Try to get one event
    const result = await iterator.next(); // Should be aborted

    logTest('Cancel Stream', result.done, 'Stream aborted correctly');
  } catch (err) {
    logTest('Cancel Stream', err.name === 'AbortError', err.message);
  }
}

// Test 5: Test retries on failure
async function testRetries() {
  try {
    // Use a non-existent endpoint to trigger failure
    const stream = stretto('https://httpbin.org/status/500', { retries: 2 });
    let count = 0;

    for await (const _ of stream) {
      count++;
    }

    logTest('Retries', false, 'Should have thrown due to HTTP 500');
  } catch (err) {
    logTest('Retries', err.message.includes('HTTP 500'), err.message);
  }
}

// Run all tests
async function runTests() {
  console.log('Running Stretto Tests...\n');
  await testSseStream();
  await testJsonParser();
  await testNdjsonParser();
  await testCancel();
  await testRetries();
  console.log('\nTests Complete');
}

runTests().catch(console.error);