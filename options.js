import { loadSettings, saveSettings, validateSettings } from './src/settings.js';
import { completeChat } from './src/llm.js';

const fields = ['baseUrl', 'apiKey', 'model'].map((id) => document.getElementById(id));
const status = document.getElementById('status');
const save = document.getElementById('save');
const testBtn = document.getElementById('test');

function read() {
  return Object.fromEntries(fields.map((el) => [el.id, el.value.trim()]));
}

function show(kind, text) {
  status.className = kind;
  status.textContent = text;
}

function validated() {
  const settings = read();
  const error = validateSettings(settings);
  if (error) show('error', error);
  return error ? null : settings;
}

save.addEventListener('click', async () => {
  const settings = validated();
  if (!settings) return;
  const origin = new URL(settings.baseUrl).origin;
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    show('error', `未授权访问 ${origin}，无法保存`);
    return;
  }
  await saveSettings(settings);
  show('ok', '已保存');
});

testBtn.addEventListener('click', async () => {
  const settings = validated();
  if (!settings) return;
  testBtn.disabled = true;
  show('', '连接中…');
  try {
    const reply = await completeChat(settings, [{ role: 'user', content: '回复 ok' }]);
    show('ok', `连接成功，模型回复：${reply.slice(0, 60)}`);
  } catch (err) {
    show('error', `连接失败：${err.message}`);
  } finally {
    testBtn.disabled = false;
  }
});

loadSettings().then((settings) => {
  for (const el of fields) el.value = settings[el.id];
});
