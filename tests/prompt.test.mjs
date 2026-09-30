import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, buildChainMessages, parseChain, buildReviewMessages, buildDebugMessages } from '../src/prompt.js';

const problem = {
  slug: 'two-sum',
  title: 'Two Sum',
  description: 'Given an array of integers nums and an integer target...',
  lang: 'C++',
};

test('chain messages ask for a JSON insight list and carry the problem', () => {
  const [system, user] = buildChainMessages(problem);
  assert.equal(system.role, 'system');
  assert.match(system.content, /只输出一个 JSON 对象，形如 \{"insights": \["…", "…"\]\}/);
  assert.equal(user.content, '题目：Two Sum\n\nGiven an array of integers nums and an integer target...');
});

test('parseChain reads plain JSON', () => {
  assert.deepEqual(parseChain('{"insights":["补数只需要查找是否出现过","哈希表让查找变成 O(1)"]}'), ['补数只需要查找是否出现过', '哈希表让查找变成 O(1)']);
});

test('parseChain strips a code fence and drops empty entries', () => {
  assert.deepEqual(parseChain('```json\n{"insights": ["补数只需要查找是否出现过", "", 3]}\n```'), ['补数只需要查找是否出现过']);
});

test('parseChain returns an empty list for an empty chain', () => {
  assert.deepEqual(parseChain('{"insights":[]}'), []);
});

test('parseChain returns null on garbage or the wrong shape', () => {
  assert.equal(parseChain('对不起，这道题没有洞察'), null);
  assert.equal(parseChain('{"hints":["x"]}'), null);
  assert.equal(parseChain('{"insights":"x"}'), null);
});

test('two insights give four numbered headings built around the insight text', () => {
  const [system, user] = buildMessages(problem, ['补数只需要查找是否出现过', '哈希表让查找变成 O(1)']);
  assert.equal(system.role, 'system');
  assert.match(system.content, /只由下面 4 个「提示」二级标题/);
  assert.match(system.content, /必须恰好输出这 4 个提示标题，不多不少：\n\n## 提示 1\n## 提示 2\n## 提示 3\n## 提示 4\n## 完整代码\n/);
  assert.match(system.content, /- 提示 1 只给思考方向/);
  assert.match(system.content, /- 提示 2 围绕这个洞察展开：「补数只需要查找是否出现过」/);
  assert.match(system.content, /- 提示 3 围绕这个洞察展开：「哈希表让查找变成 O\(1\)」/);
  assert.match(system.content, /- 提示 4 给出完整的算法步骤、边界条件、时间和空间复杂度/);
  assert.doesNotMatch(system.content, /洞察链|…\n## 提示 N/);
  assert.match(system.content, /用 C\+\+ 写出可以直接提交的完整实现，放在一个 ```cpp 代码块里/);
  assert.match(system.content, /全程用中文/);
  assert.equal(user.role, 'user');
});

test('zero insights give exactly two headings', () => {
  const [system] = buildMessages(problem, []);
  assert.match(system.content, /必须恰好输出这 2 个提示标题，不多不少：\n\n## 提示 1\n## 提示 2\n## 完整代码\n/);
  assert.match(system.content, /- 提示 2 给出完整的算法步骤/);
  assert.doesNotMatch(system.content, /围绕这个洞察展开/);
});

test('user message carries the title and description', () => {
  const [, user] = buildMessages(problem, []);
  assert.equal(user.content, '题目：Two Sum\n\nGiven an array of integers nums and an integer target...');
});

test('a different language changes both the prose and the fence tag', () => {
  const [system] = buildMessages({ ...problem, lang: 'Go' }, []);
  assert.match(system.content, /用 Go 写出.*```golang 代码块/);
});

test('review system message fixes the four headings in order and names the fence', () => {
  const [system, user] = buildReviewMessages(problem, 'int x = 1;');
  assert.equal(system.role, 'system');
  assert.match(system.content, /^你是一位严格但友善的算法面试官/);
  assert.match(system.content, /用 C\+\+ 写的代码/);
  assert.match(system.content, /## 正确性\n## 复杂度\n## 问题\n## 改进建议/);
  assert.match(system.content, /可以附一小段 ```cpp 代码块/);
  assert.equal(user.role, 'user');
});

test('review user message carries the problem and the fenced code in the editor language', () => {
  const [, user] = buildReviewMessages({ ...problem, lang: 'Python3' }, 'class Solution:\n    pass');
  assert.equal(
    user.content,
    '题目：Two Sum\n\nGiven an array of integers nums and an integer target...\n\n我的代码（Python3）：\n```python3\nclass Solution:\n    pass\n```',
  );
});

test('debug system message fixes the four headings in order and names the fence', () => {
  const [system, user] = buildDebugMessages(problem, 'int x = 1;', 'Wrong Answer');
  assert.equal(system.role, 'system');
  assert.match(system.content, /^你是一位耐心的算法助教。用户正在做 LeetCode 题目，他用 C\+\+ 写的代码没有通过，先帮用户看懂错在哪，再引导修复/);
  assert.match(system.content, /## 错误原因\n## 出错位置\n## 修复思路\n## 修正后的代码/);
  assert.match(system.content, /用 C\+\+ 给出完整的修正实现，放在一个 ```cpp 代码块里/);
  assert.match(system.content, /如果运行结果显示 Accepted/);
  assert.equal(user.role, 'user');
});

test('debug user message carries the problem, the fenced code and the fenced run result', () => {
  const [, user] = buildDebugMessages({ ...problem, lang: 'Python3' }, 'class Solution:\n    pass', 'Wrong Answer\nInput\nnums = [3,3]\ntarget = 6\nOutput\n[]\nExpected\n[0,1]');
  assert.equal(
    user.content,
    '题目：Two Sum\n\nGiven an array of integers nums and an integer target...\n\n我的代码（Python3）：\n```python3\nclass Solution:\n    pass\n```\n\n运行结果：\n```\nWrong Answer\nInput\nnums = [3,3]\ntarget = 6\nOutput\n[]\nExpected\n[0,1]\n```',
  );
});
