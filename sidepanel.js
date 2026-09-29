import { readProblem, readEditorCode } from './src/page.js';
import { detectLang } from './src/langs.js';
import { buildMessages, buildReviewMessages } from './src/prompt.js';
import { splitSections } from './src/sections.js';
import { streamChat } from './src/llm.js';
import { loadSettings, validateSettings } from './src/settings.js';
import { loadHint, saveHint, doneStatus } from './src/hints.js';

const PROBLEM_URL = /^https:\/\/leetcode\.com\/problems\/[^/?#]+/;
const $ = (id) => document.getElementById(id);
const el = Object.fromEntries(['title', 'difficulty', 'lang', 'retry', 'settings'].map((id) => [id, $(id)]));
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
};
const IDLE = { status: 'idle' };
const pinnedTabId = Number(new URLSearchParams(location.search).get('tabId')) || null;
const entries = new Map();
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
  el.difficulty.textContent = problem?.difficulty ?? '';
  el.difficulty.hidden = !problem?.difficulty;
  el.lang.textContent = problem?.lang ?? '';
  el.retry.hidden = Boolean(problem);
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
  track.status.className = status === 'error' ? 'error' : '';
  track.status.textContent = problem
    ? { idle: '', streaming: track.busy, done: doneStatus({ ...state, problem }), error: state.message }[status]
    : message;
  renderSections(track, state.markdown ? splitSections(state.markdown) : []);
}

function renderSections({ sections: container, toggled, defaultOpen }, sections) {
  sections.forEach((section, i) => {
    let node = container.children[i];
    if (node?.dataset.title !== section.title) {
      const fresh = document.createElement('details');
      fresh.dataset.title = section.title;
      fresh.innerHTML = '<summary></summary><div class="body"></div>';
      fresh.firstChild.textContent = section.title;
      fresh.addEventListener('toggle', () => (fresh.open === defaultOpen ? toggled.delete(section.title) : toggled.add(section.title)));
      if (node) node.replaceWith(fresh);
      else container.append(fresh);
      node = fresh;
    }
    node.open = toggled.has(section.title) !== defaultOpen;
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
  button.className = 'copy';
  button.textContent = '复制';
  button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(pre.querySelector('code').textContent);
    button.textContent = '已复制';
    setTimeout(() => (button.textContent = '复制'), 1500);
  });
  pre.append(button);
}

async function currentTab() {
  if (pinnedTabId) return chrome.tabs.get(pinnedTabId);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
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
  let found = entries.get(problem.slug);
  if (!found) {
    found = { problem, hints: (await storedState(problem.slug)) ?? IDLE, review: IDLE };
    entries.set(problem.slug, found);
  }
  found.problem = problem;
  entry = found;
  render();
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
  setTrack(slug, track, { status: 'streaming', markdown });
  try {
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
  const markdown = await run(TRACKS.hints, problem, buildMessages(problem));
  if (markdown !== null) await saveHint(problem.slug, { markdown, lang: problem.lang });
}

async function evaluate() {
  const { problem } = entry;
  let code;
  try {
    const tab = await currentTab();
    [{ result: code }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: readEditorCode });
  } catch (err) {
    setTrack(problem.slug, TRACKS.review, { status: 'error', message: `读取编辑器失败：${err.message}` });
    return;
  }
  if (!code?.trim()) {
    setTrack(problem.slug, TRACKS.review, { status: 'error', message: '编辑器里没有代码' });
    return;
  }
  await run(TRACKS.review, problem, buildReviewMessages(problem, code));
}

for (const track of Object.values(TRACKS)) {
  track.tab.addEventListener('click', () => {
    view = track.key;
    render();
  });
  track.stop.addEventListener('click', () => track.controller?.abort());
}
TRACKS.hints.generate.addEventListener('click', generate);
TRACKS.review.generate.addEventListener('click', evaluate);
el.retry.addEventListener('click', refresh);
el.settings.addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.tabs.onActivated.addListener(async ({ windowId }) => {
  if (pinnedTabId) return;
  const { id } = await chrome.windows.getCurrent();
  if (windowId === id) refresh();
});
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (!info.url && info.status !== 'complete') return;
  const tab = await currentTab().catch(() => null);
  if (tab?.id === tabId) refresh();
});

refresh();
