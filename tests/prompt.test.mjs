import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages } from '../src/prompt.js';

const problem = {
  slug: 'two-sum',
  title: 'Two Sum',
  description: 'Given an array of integers nums and an integer target...',
  lang: 'C++',
};

test('system message fixes the four headings and names the language and fence', () => {
  const [system, user] = buildMessages(problem);
  assert.equal(system.role, 'system');
  assert.match(system.content, /## 提示 1\n## 提示 2\n## 提示 3\n## 完整代码/);
  assert.match(system.content, /用 C\+\+ 写出可以直接提交的完整实现，放在一个 ```cpp 代码块里/);
  assert.equal(user.role, 'user');
});

test('user message carries the title and description', () => {
  const [, user] = buildMessages(problem);
  assert.equal(user.content, '题目：Two Sum\n\nGiven an array of integers nums and an integer target...');
});

test('a different language changes both the prose and the fence tag', () => {
  const [system] = buildMessages({ ...problem, lang: 'Go' });
  assert.match(system.content, /用 Go 写出.*```golang 代码块/);
});
