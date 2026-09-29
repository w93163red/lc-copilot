import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLang } from '../src/langs.js';

test('picks the first button text that names a language', () => {
  assert.equal(detectLang(['Auto', ' C++ ', 'Python3']), 'C++');
});

test('unknown texts fall back to Python3', () => {
  assert.equal(detectLang(['Run', 'Submit']), 'Python3');
  assert.equal(detectLang([]), 'Python3');
});

test('matches case-sensitively so python is not a language', () => {
  assert.equal(detectLang(['python', 'Java']), 'Java');
});
