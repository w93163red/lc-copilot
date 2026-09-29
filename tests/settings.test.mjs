import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings } from '../src/settings.js';

const ok = { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-1', model: 'gpt-4o-mini' };

test('valid settings pass', () => {
  assert.equal(validateSettings(ok), null);
  assert.equal(validateSettings({ ...ok, baseUrl: 'http://localhost:11434/v1' }), null);
});

test('each missing or malformed field names itself', () => {
  assert.equal(validateSettings({ ...ok, baseUrl: 'api.openai.com/v1' }), 'Base URL 不是合法的网址');
  assert.equal(validateSettings({ ...ok, baseUrl: 'ftp://x.example' }), 'Base URL 必须以 http:// 或 https:// 开头');
  assert.equal(validateSettings({ ...ok, apiKey: '  ' }), 'API Key 不能为空');
  assert.equal(validateSettings({ ...ok, model: '' }), '模型名不能为空');
});
