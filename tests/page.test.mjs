import test from 'node:test';
import assert from 'node:assert/strict';
import { readEditorCode, readRunResult } from '../src/page.js';

const model = (lang, value) => ({ getLanguageId: () => lang, getValue: () => value });

test('returns the first non-plaintext model text', () => {
  globalThis.monaco = { editor: { getModels: () => [model('plaintext', 'notes'), model('cpp', 'class Solution {};'), model('python', 'x')] } };
  assert.equal(readEditorCode(), 'class Solution {};');
});

test('returns empty without monaco or without a code model', () => {
  delete globalThis.monaco;
  assert.equal(readEditorCode(), '');
  globalThis.monaco = { editor: { getModels: () => [model('plaintext', 'notes')] } };
  assert.equal(readEditorCode(), '');
});

const tab = (layoutPath, innerText, children = []) => {
  const node = { className: 'flexlayout__tab', dataset: { layoutPath }, innerText, closest: () => node };
  for (const child of children) child.closest = () => node;
  return node;
};
const dom = (tabs, locator = null) => ({
  querySelector: () => locator,
  querySelectorAll: () => tabs,
});

test('reads the tab around the verdict locator, collapsing whitespace per line and dropping blank lines', () => {
  const verdict = { innerText: 'Wrong Answer' };
  const result = tab('/c1/ts1/t1', '  Wrong   Answer \n\nInput\n  nums = [3,3]\n\ttarget =   6\nOutput\n[]\nExpected\n[0,1]\n', [verdict]);
  globalThis.document = dom([tab('/ts0/t0', 'Given an array'), result], verdict);
  assert.equal(readRunResult(), 'Wrong Answer\nInput\nnums = [3,3]\ntarget = 6\nOutput\n[]\nExpected\n[0,1]');
});

test('falls back to the first tab whose text starts with a verdict, preferring the Test Result tab, and caps the length', () => {
  globalThis.document = dom([tab('/ts0/t3', 'Accepted\n1 ms'), tab('/c1/ts1/t1', 'Runtime Error\n' + 'x'.repeat(5000))]);
  const text = readRunResult();
  assert.equal(text.length, 4000);
  assert.equal(text.slice(0, 16), 'Runtime Error\nxx');
  globalThis.document = dom([tab('/ts0/t0', 'Given an array'), tab('/ts0/t3', 'Accepted\n1 ms')]);
  assert.equal(readRunResult(), 'Accepted\n1 ms');
});

test('returns empty when nothing matches or the DOM throws', () => {
  globalThis.document = dom([tab('/ts0/t0', 'Given an array')]);
  assert.equal(readRunResult(), '');
  globalThis.document = { querySelector: () => { throw new Error('boom'); }, querySelectorAll: () => [] };
  assert.equal(readRunResult(), '');
});
