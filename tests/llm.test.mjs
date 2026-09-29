import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSSE, streamChat, completeChat } from '../src/llm.js';

test('complete events are returned and the incomplete tail is kept', () => {
  assert.deepEqual(parseSSE('data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c"'), {
    events: ['{"a":1}', '{"b":2}'],
    rest: 'data: {"c"',
  });
});

test('an event split across chunks completes once the rest is appended', () => {
  const first = parseSSE('data: {"choices":[{"delta":{"con');
  assert.deepEqual(first, { events: [], rest: 'data: {"choices":[{"delta":{"con' });
  const second = parseSSE(first.rest + 'tent":"你好"}}]}\n\n');
  assert.deepEqual(second, { events: ['{"choices":[{"delta":{"content":"你好"}}]}'], rest: '' });
});

test('[DONE] is returned as a plain event', () => {
  assert.deepEqual(parseSSE('data: {"x":1}\n\ndata: [DONE]\n\n'), {
    events: ['{"x":1}', '[DONE]'],
    rest: '',
  });
});

test('blank keepalives and comment lines are skipped', () => {
  assert.deepEqual(parseSSE('\n\n: keepalive\n\n\n\ndata: {"y":2}\n\n'), {
    events: ['{"y":2}'],
    rest: '',
  });
});

test('CRLF framing and multi-line data are handled', () => {
  assert.deepEqual(parseSSE('event: message\r\ndata: a\r\ndata: b\r\n\r\n'), {
    events: ['a\nb'],
    rest: '',
  });
});

const settings = { baseUrl: 'https://api.example.com/v1/', apiKey: 'sk-test', model: 'gpt-x' };

function stubFetch(status, chunks) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const body = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
    return new Response(body, { status, statusText: status === 200 ? 'OK' : 'Unauthorized' });
  };
  return calls;
}

test('streamChat posts the OpenAI shape and reports deltas until [DONE]', async () => {
  const calls = stubFetch(200, [
    'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\ndata: {"choices":[{"delta":{"content":"## 提"}}]}\n\ndata: {"choices":[{"delta":{"con',
    'tent":"示 1"}}]}\n\n: ping\n\ndata: [DONE]\n\ndata: {"choices":[{"delta":{"content":"ignored"}}]}\n\n',
  ]);
  const deltas = [];
  await streamChat(settings, [{ role: 'user', content: 'hi' }], (d) => deltas.push(d));
  assert.deepEqual(deltas, ['## 提', '示 1']);
  assert.equal(calls[0].url, 'https://api.example.com/v1/chat/completions');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(calls[0].init.headers, {
    Authorization: 'Bearer sk-test',
    'Content-Type': 'application/json',
  });
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: 'gpt-x',
    messages: [{ role: 'user', content: 'hi' }],
    stream: true,
  });
});

test('streamChat throws with the status and a body snippet on non-2xx', async () => {
  stubFetch(401, ['{"error":{"message":"Incorrect API key"}}']);
  await assert.rejects(streamChat(settings, [], () => {}), (err) => {
    assert.equal(err.status, 401);
    assert.equal(err.message, 'HTTP 401 Unauthorized: {"error":{"message":"Incorrect API key"}}');
    return true;
  });
});

test('completeChat returns the message content of a non-streaming reply', async () => {
  const calls = stubFetch(200, ['{"choices":[{"message":{"role":"assistant","content":"pong"}}]}']);
  assert.equal(await completeChat(settings, [{ role: 'user', content: 'ping' }]), 'pong');
  assert.equal(JSON.parse(calls[0].init.body).stream, false);
});
