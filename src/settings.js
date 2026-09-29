export const DEFAULT_SETTINGS = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

export async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

export function validateSettings({ baseUrl, apiKey, model }) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return 'Base URL 不是合法的网址';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Base URL 必须以 http:// 或 https:// 开头';
  if (!apiKey.trim()) return 'API Key 不能为空';
  if (!model.trim()) return '模型名不能为空';
  return null;
}
