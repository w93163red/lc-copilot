import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSections } from '../src/sections.js';

test('complete output yields four titled sections in order', () => {
  const md = '好的，下面是提示。\n\n## 提示 1\n想一想暴力。\n\n## 提示 2\n用哈希。\n## 提示 3\n步骤。\n## 完整代码\n```python3\nprint(1)\n```\n说明。\n';
  assert.deepEqual(splitSections(md), [
    { title: '提示 1', body: '想一想暴力。' },
    { title: '提示 2', body: '用哈希。' },
    { title: '提示 3', body: '步骤。' },
    { title: '完整代码', body: '```python3\nprint(1)\n```\n说明。' },
  ]);
});

test('partial trailing section while streaming keeps what has arrived', () => {
  assert.deepEqual(splitSections('## 提示 1\n第一句\n## 提示'), [
    { title: '提示 1', body: '第一句\n## 提示' },
  ]);
  assert.deepEqual(splitSections('## 提示 1\n第一句\n## 提示 2\n'), [
    { title: '提示 1', body: '第一句' },
    { title: '提示 2', body: '' },
  ]);
});

test('no headings yields no sections', () => {
  assert.deepEqual(splitSections('只有前言，没有标题。'), []);
  assert.deepEqual(splitSections(''), []);
});

test('a ## line inside a fenced code block does not split', () => {
  const md = '## 完整代码\n```python3\n## 这是注释\nx = 1\n```\n完成。\n## 提示 3\n尾。';
  assert.deepEqual(splitSections(md), [
    { title: '完整代码', body: '```python3\n## 这是注释\nx = 1\n```\n完成。' },
    { title: '提示 3', body: '尾。' },
  ]);
});

test('an unclosed fence during streaming swallows later headings until it closes', () => {
  assert.deepEqual(splitSections('## 完整代码\n~~~cpp\n## not a heading\n'), [
    { title: '完整代码', body: '~~~cpp\n## not a heading' },
  ]);
});

test('### headings and indented ## are not section boundaries', () => {
  assert.deepEqual(splitSections('## 提示 1\n### 小标题\n  ## 缩进\n正文'), [
    { title: '提示 1', body: '### 小标题\n  ## 缩进\n正文' },
  ]);
});
