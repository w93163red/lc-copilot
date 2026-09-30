import { readProblem, readEditorCode, readRunResult } from './src/page.js';
import { detectLang } from './src/langs.js';
import { buildMessages, buildChainMessages, parseChain, buildReviewMessages, buildDebugMessages } from './src/prompt.js';
import { splitSections } from './src/sections.js';
import { streamChat, completeChat } from './src/llm.js';
import { loadSettings, validateSettings } from './src/settings.js';
import { loadHint, saveHint, doneStatus } from './src/hints.js';

const PROBLEM_URL = /^https:\/\/leetcode\.com\/problems\/[^/?#]+/;
const $ = (id) => document.getElementById(id);
const el = Object.fromEntries(['title', 'difficulty', 'lang', 'rebind', 'retry', 'settings'].map((id) => [id, $(id)]));
const TRACKS = {
  hints: {
    key: 'hints',
    tab: $('tab-hints'), panel: $('hints'), generate: $('generate'), stop: $('stop'), status: $('status'), sections: $('sections'),
    label: '生成提示', relabel: '重新生成', busy: '生成中…', defaultOpen: false, toggled: new Set(), controller: null,
  },
  review: {
    key: 'review',
    tab: $('tab-review'), panel: $('review'), generate: $('evaluate'), stop: $('stop-review'), status: $('status-review'), sections: $('sections-review'),
    label: '评估代码', relabel: '重新评估', busy: '评估中…', defaultOpen: true, toggled: new Set(), controller: null,
  },
  debug: {
    key: 'debug',
    tab: $('tab-debug'), panel: $('debug'), generate: $('debug-run'), stop: $('stop-debug'), status: $('status-debug'), sections: $('sections-debug'),
    read: $('read-result'), input: $('result-input'),
    label: '找错', relabel: '重新找错', busy: '分析中…', defaultOpen: (title) => title !== '修正后的代码', toggled: new Set(), controller: null,
  },
};
const NO_RESULT = '没有读到运行结果，请先在页面上 Run 或 Submit，或手动粘贴';
const FALLBACK_INSIGHTS = ['解决暴力解瓶颈的关键观察'];
const IDLE = { status: 'idle' };
const entries = new Map();
let boundTabId = Number(new URLSearchParams(location.search).get('tabId')) || null;
let activeTab = null;
let entry = null;
let message = '';
let view = 'hints';

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
marked.use({ renderer: { html: (token) => escapeHtml(token.text) } });

function showMessage(text) {
  entry = null;
  message = text;
  render();
}

function setTrack(slug, track, state) {
  entries.get(slug)[track.key] = state;
  if (entry?.problem.slug === slug) render();
}

function render() {
  const problem = entry?.problem;
  el.title.textContent = problem ? problem.title : '未检测到题目';
  const difficulty = problem?.difficulty ?? '';
  el.difficulty.textContent = difficulty;
  el.difficulty.className = `badge badge-${difficulty.toLowerCase()}`;
  el.difficulty.hidden = !difficulty;
  el.lang.textContent = problem?.lang ?? '';
  el.lang.hidden = !problem;
  el.retry.hidden = Boolean(problem);
  renderRebind();
  TRACKS.debug.read.hidden = !problem;
  const resultText = entry?.resultText ?? '';
  if (TRACKS.debug.input.value !== resultText) TRACKS.debug.input.value = resultText;
  for (const track of Object.values(TRACKS)) {
    track.tab.setAttribute('aria-selected', track.key === view);
    track.panel.hidden = track.key !== view;
    renderTrack(track, entry?.[track.key] ?? IDLE, problem);
  }
}

function renderTrack(track, state, problem) {
  const { status } = state;
  track.generate.hidden = !problem || status === 'streaming';
  track.generate.textContent = status === 'idle' ? track.label : track.relabel;
  track.stop.hidden = status !== 'streaming';
  track.status.className = status === 'error' ? 'status alert-destructive' : 'status';
  const busyText = state.phase === 'plan' ? '规划中…' : track.busy;
  const text = problem ? { idle: '', streaming: busyText, done: doneStatus({ ...state, problem }), error: state.message }[status] : message;
  const busy = Boolean(problem) && status === 'streaming';
  if (Boolean(track.status.firstElementChild) !== busy || track.status.textContent !== text) {
    track.status.replaceChildren(...(busy ? [spinner()] : []), text);
  }
  renderSections(track, state.markdown ? splitSections(state.markdown) : []);
}

function renderRebind() {
  const target = activeTab && activeTab.id !== boundTabId && PROBLEM_URL.test(activeTab.url ?? '') ? activeTab : null;
  el.rebind.hidden = !target;
  if (target) el.rebind.textContent = `当前标签页是「${(target.title ?? '').replace(/\s*-\s*LeetCode\s*$/, '')}」，切换到这一题`;
}

const spinner = () => Object.assign(document.createElement('span'), { className: 'spinner' });

function renderSections({ sections: container, toggled, defaultOpen }, sections) {
  sections.forEach((section, i) => {
    const open = typeof defaultOpen === 'function' ? defaultOpen(section.title) : defaultOpen;
    let node = container.children[i];
    if (node?.dataset.title !== section.title) {
      const fresh = document.createElement('details');
      fresh.dataset.title = section.title;
      fresh.innerHTML = '<summary></summary><div class="body"></div>';
      fresh.firstChild.textContent = section.title;
      fresh.addEventListener('toggle', () => (fresh.open === open ? toggled.delete(section.title) : toggled.add(section.title)));
      if (node) node.replaceWith(fresh);
      else container.append(fresh);
      node = fresh;
    }
    node.open = toggled.has(section.title) !== open;
    if (node.dataset.body !== section.body) {
      node.dataset.body = section.body;
      node.lastChild.innerHTML = marked.parse(section.body);
      for (const pre of node.lastChild.querySelectorAll('pre')) addCopyButton(pre);
    }
  });
  while (container.children.length > sections.length) container.lastChild.remove();
}

function addCopyButton(pre) {
  const button = document.createElement('button');
  button.className = 'copy btn btn-ghost btn-sm';
  button.textContent = '复制';
  button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(pre.querySelector('code').textContent);
    button.textContent = '已复制';
    setTimeout(() => (button.textContent = '复制'), 1500);
  });
  pre.append(button);
}

async function currentTab() {
  return boundTabId === null ? null : chrome.tabs.get(boundTabId);
}

async function syncActive() {
  [activeTab = null] = await chrome.tabs.query({ active: true, currentWindow: true });
  renderRebind();
}

function bind(tabId) {
  boundTabId = tabId ?? null;
  return refresh();
}

async function refresh() {
  let tab;
  try {
    tab = await currentTab();
  } catch {
    tab = null;
  }
  if (!tab || !PROBLEM_URL.test(tab.url ?? '')) {
    showMessage('当前标签页不是 LeetCode 题目页面，请打开 https://leetcode.com/problems/… 后重试。');
    return;
  }
  let raw;
  try {
    [{ result: raw }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readProblem });
  } catch {
    raw = null;
  }
  if (!raw || !raw.description) {
    showMessage('题目页面还没加载完成，请等页面加载后点击“重新读取”。');
    return;
  }
  const { editorButtons, ...rest } = raw;
  const problem = { ...rest, lang: detectLang(editorButtons) };
  const previous = entry;
  let found = entries.get(problem.slug);
  if (!found) {
    found = { problem, hints: (await storedState(problem.slug)) ?? IDLE, review: IDLE, debug: IDLE, resultText: '' };
    entries.set(problem.slug, found);
  }
  found.problem = problem;
  entry = found;
  render();
  if (view === 'debug' && found !== previous) autoReadResult();
}

function autoReadResult() {
  if (entry && !entry.resultText.trim()) readResult();
}

async function readResult() {
  const current = entry;
  let text;
  try {
    const tab = await currentTab();
    [{ result: text }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readRunResult });
  } catch {
    text = '';
  }
  current.resultText = text || '';
  const { slug } = current.problem;
  if (!current.resultText) setTrack(slug, TRACKS.debug, { status: 'error', message: NO_RESULT });
  else if (current.debug.status === 'error') setTrack(slug, TRACKS.debug, IDLE);
  else setTrack(slug, TRACKS.debug, current.debug);
}

async function storedState(slug) {
  const hint = await loadHint(slug);
  return hint && { status: 'done', markdown: hint.markdown, cached: { lang: hint.lang, savedAt: hint.savedAt } };
}

async function run(track, problem, messages) {
  const { slug } = problem;
  const settings = await loadSettings();
  const invalid = validateSettings(settings);
  if (invalid) {
    setTrack(slug, track, { status: 'error', message: `${invalid}，请先在设置中填写。` });
    return null;
  }
  track.controller?.abort();
  track.controller = new AbortController();
  const { signal } = track.controller;
  let markdown = '';
  try {
    if (typeof messages === 'function') {
      setTrack(slug, track, { status: 'streaming', markdown, phase: 'plan' });
      messages = await messages(settings, signal);
    }
    setTrack(slug, track, { status: 'streaming', markdown });
    await streamChat(settings, messages, (delta) => {
      markdown += delta;
      setTrack(slug, track, { status: 'streaming', markdown });
    }, signal);
  } catch (err) {
    setTrack(slug, track, signal.aborted ? { status: 'done', markdown } : { status: 'error', markdown, message: `生成失败：${err.message}` });
    return null;
  }
  setTrack(slug, track, { status: 'done', markdown });
  return markdown;
}

async function generate() {
  const { problem } = entry;
  const markdown = await run(TRACKS.hints, problem, async (settings, signal) => {
    const insights = parseChain(await completeChat(settings, buildChainMessages(problem), signal)) ?? FALLBACK_INSIGHTS;
    return buildMessages(problem, insights);
  });
  if (markdown !== null) await saveHint(problem.slug, { markdown, lang: problem.lang });
}

async function editorCode(track, slug) {
  let code;
  try {
    const tab = await currentTab();
    [{ result: code }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: readEditorCode });
  } catch (err) {
    setTrack(slug, track, { status: 'error', message: `读取编辑器失败：${err.message}` });
    return null;
  }
  if (code?.trim()) return code;
  setTrack(slug, track, { status: 'error', message: '编辑器里没有代码' });
  return null;
}

async function evaluate() {
  const { problem } = entry;
  const code = await editorCode(TRACKS.review, problem.slug);
  if (code !== null) await run(TRACKS.review, problem, buildReviewMessages(problem, code));
}

async function debug() {
  const { problem } = entry;
  const result = entry.resultText.trim();
  if (!result) {
    setTrack(problem.slug, TRACKS.debug, { status: 'error', message: '没有运行结果，先点「读取结果」或粘贴报错' });
    return;
  }
  const code = await editorCode(TRACKS.debug, problem.slug);
  if (code !== null) await run(TRACKS.debug, problem, buildDebugMessages(problem, code, result));
}

for (const track of Object.values(TRACKS)) {
  track.tab.addEventListener('click', () => {
    view = track.key;
    render();
    if (track.key === 'debug') autoReadResult();
  });
  track.stop.addEventListener('click', () => track.controller?.abort());
}
TRACKS.hints.generate.addEventListener('click', generate);
TRACKS.review.generate.addEventListener('click', evaluate);
TRACKS.debug.generate.addEventListener('click', debug);
TRACKS.debug.read.addEventListener('click', readResult);
TRACKS.debug.input.addEventListener('input', () => {
  if (entry) entry.resultText = TRACKS.debug.input.value;
});
el.rebind.addEventListener('click', () => bind(activeTab?.id));
el.retry.addEventListener('click', () => bind(boundTabId ?? activeTab?.id));
el.settings.addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.tabs.onActivated.addListener(syncActive);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === boundTabId && (info.url || info.status === 'complete')) refresh();
  syncActive();
});
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId !== boundTabId) return;
  boundTabId = null;
  showMessage('绑定的标签页已关闭，请打开一道题目后点「绑定当前标签页」');
});

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab = null]) => {
  activeTab = tab;
  bind(boundTabId ?? tab?.id);
});
