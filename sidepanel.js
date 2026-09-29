import { readProblem } from './src/page.js';
import { detectLang } from './src/langs.js';
import { buildMessages } from './src/prompt.js';
import { splitSections } from './src/sections.js';
import { streamChat } from './src/llm.js';
import { loadSettings, validateSettings } from './src/settings.js';

const PROBLEM_URL = /^https:\/\/leetcode\.com\/problems\/[^/?#]+/;
const el = Object.fromEntries(
  ['title', 'lang', 'generate', 'stop', 'retry', 'settings', 'status', 'sections'].map((id) => [id, document.getElementById(id)]),
);
const pinnedTabId = Number(new URLSearchParams(location.search).get('tabId')) || null;
const cache = new Map();
const openTitles = new Set();
let state = { status: 'no-problem', message: '' };
let controller = null;

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
marked.use({ renderer: { html: (token) => escapeHtml(token.text) } });

function show(next) {
  if (next.problem) cache.set(next.problem.slug, next);
  state = next;
  render();
}

function update(next) {
  cache.set(next.problem.slug, next);
  if (state.problem?.slug === next.problem.slug) show(next);
}

function render() {
  const { status, problem } = state;
  el.title.textContent = problem ? problem.title : '未检测到题目';
  el.lang.textContent = problem ? problem.lang : '';
  el.generate.hidden = status === 'no-problem' || status === 'streaming';
  el.generate.textContent = status === 'idle' ? '生成提示' : '重新生成';
  el.stop.hidden = status !== 'streaming';
  el.retry.hidden = status !== 'no-problem';
  el.status.className = status === 'error' ? 'error' : '';
  el.status.textContent =
    { 'no-problem': state.message, idle: '', streaming: '生成中…', done: '完成', error: state.message }[status];
  renderSections(state.markdown ? splitSections(state.markdown) : []);
}

function renderSections(sections) {
  sections.forEach((section, i) => {
    let node = el.sections.children[i];
    if (node?.dataset.title !== section.title) {
      const fresh = document.createElement('details');
      fresh.dataset.title = section.title;
      fresh.innerHTML = '<summary></summary><div class="body"></div>';
      fresh.firstChild.textContent = section.title;
      fresh.addEventListener('toggle', () => (fresh.open ? openTitles.add(section.title) : openTitles.delete(section.title)));
      if (node) node.replaceWith(fresh);
      else el.sections.append(fresh);
      node = fresh;
    }
    node.open = openTitles.has(section.title);
    if (node.dataset.body !== section.body) {
      node.dataset.body = section.body;
      node.lastChild.innerHTML = marked.parse(section.body);
      for (const pre of node.lastChild.querySelectorAll('pre')) addCopyButton(pre);
    }
  });
  while (el.sections.children.length > sections.length) el.sections.lastChild.remove();
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
    show({ status: 'no-problem', message: '当前标签页不是 LeetCode 题目页面，请打开 https://leetcode.com/problems/… 后重试。' });
    return;
  }
  let raw;
  try {
    [{ result: raw }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readProblem });
  } catch {
    raw = null;
  }
  if (!raw || !raw.description) {
    show({ status: 'no-problem', message: '题目页面还没加载完成，请等页面加载后点击“重新读取”。' });
    return;
  }
  const { editorButtons, ...rest } = raw;
  const problem = { ...rest, lang: detectLang(editorButtons) };
  const cached = cache.get(problem.slug);
  show(cached ? { ...cached, problem } : { status: 'idle', problem });
}

async function generate() {
  const { problem } = state;
  const settings = await loadSettings();
  const invalid = validateSettings(settings);
  if (invalid) {
    update({ status: 'error', problem, message: `${invalid}，请先在设置中填写。` });
    return;
  }
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  let markdown = '';
  update({ status: 'streaming', problem, markdown });
  try {
    await streamChat(settings, buildMessages(problem), (delta) => {
      markdown += delta;
      update({ status: 'streaming', problem, markdown });
    }, signal);
    update({ status: 'done', problem, markdown });
  } catch (err) {
    if (signal.aborted) update({ status: 'done', problem, markdown });
    else update({ status: 'error', problem, markdown, message: `生成失败：${err.message}` });
  }
}

el.generate.addEventListener('click', generate);
el.stop.addEventListener('click', () => controller?.abort());
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
