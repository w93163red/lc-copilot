export function parseSSE(buffer) {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop();
  const events = [];
  for (const block of blocks) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''));
    if (data.length) events.push(data.join('\n'));
  }
  return { events, rest };
}

async function postChat(settings, body, signal) {
  const url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: settings.model, ...body }),
    signal,
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    const err = new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

export async function streamChat(settings, messages, onDelta, signal) {
  const res = await postChat(settings, { messages, stream: true }, signal);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSSE(buffer);
    buffer = rest;
    for (const event of events) {
      if (event === '[DONE]') return;
      const delta = JSON.parse(event).choices?.[0]?.delta?.content;
      if (delta) onDelta(delta);
    }
  }
}

export async function completeChat(settings, messages, signal) {
  const res = await postChat(settings, { messages, stream: false }, signal);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
}
