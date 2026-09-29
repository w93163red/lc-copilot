import test from 'node:test';
import assert from 'node:assert/strict';
import { readEditorCode } from '../src/page.js';

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
