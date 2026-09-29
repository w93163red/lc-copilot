import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { loadHint, saveHint, doneStatus } from '../src/hints.js';

const store = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => (key in store ? { [key]: store[key] } : {}),
      set: async (items) => Object.assign(store, items),
    },
  },
};

test('missing slug loads as null', async () => {
  assert.equal(await loadHint('two-sum'), null);
});

test('saved hint round-trips with a timestamp under hints:<slug>', async () => {
  mock.method(Date, 'now', () => 1700000000000);
  await saveHint('two-sum', { markdown: '## 提示 1\n\n先想暴力。', lang: 'C++' });
  assert.deepEqual(Object.keys(store), ['hints:two-sum']);
  assert.deepEqual(store['hints:two-sum'], { markdown: '## 提示 1\n\n先想暴力。', lang: 'C++', savedAt: 1700000000000 });
  assert.deepEqual(await loadHint('two-sum'), { markdown: '## 提示 1\n\n先想暴力。', lang: 'C++', savedAt: 1700000000000 });
});

test('done status: fresh, cached, and cached in another language', () => {
  const savedAt = new Date(2026, 8, 29, 12).getTime();
  const problem = { lang: 'C++' };
  assert.equal(doneStatus({ problem }), '完成');
  assert.equal(doneStatus({ problem, cached: { lang: 'C++', savedAt } }), '已缓存 · 2026-09-29');
  assert.equal(
    doneStatus({ problem, cached: { lang: 'Python3', savedAt } }),
    '已缓存 · 2026-09-29，缓存的代码是 Python3，当前编辑器是 C++，可点「重新生成」',
  );
});
