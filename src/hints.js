export async function loadHint(slug) {
  const key = `hints:${slug}`;
  const { [key]: record } = await chrome.storage.local.get(key);
  return record ?? null;
}

export async function saveHint(slug, { markdown, lang }) {
  await chrome.storage.local.set({ [`hints:${slug}`]: { markdown, lang, savedAt: Date.now() } });
}

export function doneStatus({ cached, problem }) {
  if (!cached) return '完成';
  const d = new Date(cached.savedAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const line = `已缓存 · ${date}`;
  if (cached.lang === problem.lang) return line;
  return `${line}，缓存的代码是 ${cached.lang}，当前编辑器是 ${problem.lang}，可点「重新生成」`;
}
