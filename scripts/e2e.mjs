import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

const EXT = path.resolve(new URL('..', import.meta.url).pathname);
const PW = process.env.PLAYWRIGHT_MODULE || path.join(execSync('npm root -g').toString().trim(), '@playwright/mcp/node_modules/playwright');
const EXE = process.env.CHROMIUM_PATH;
if (!EXE) throw new Error('set CHROMIUM_PATH to a Chromium/Chrome binary (extensions need a headful browser)');
const { chromium } = await import(path.join(PW, 'index.mjs'));
const OUT = os.tmpdir();

const HINTS = [
  '## 提示 1\n\n先想暴力：两层循环枚举每一对。瓶颈在哪？\n\n',
  '## 提示 2\n\n关键观察：对每个 x，只需要知道 target - x 是否出现过。用哈希表记录“见过的数 → 下标”。\n\n',
  '## 提示 3\n\n一次遍历。对每个 nums[i]，查 target - nums[i] 是否在表里；在就返回，不在就把 nums[i] 存进去。时间 O(n)，空间 O(n)。\n\n',
  '## 完整代码\n\n```cpp\n// ## 这一行不是标题\nclass Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        unordered_map<int,int> seen;\n        for (int i = 0; i < nums.size(); ++i) {\n            auto it = seen.find(target - nums[i]);\n            if (it != seen.end()) return {it->second, i};\n            seen[nums[i]] = i;\n        }\n        return {};\n    }\n};\n```\n\n哈希表把查找降到 O(1)。\n',
];

const REVIEW = [
  '## 正确性\n\n正确。哈希表一次遍历能覆盖所有用例，包括重复元素如 [3,3]。\n\n',
  '## 复杂度\n\n时间 O(n)，空间 O(n)。对这道题已经最优。\n\n',
  '## 问题\n\n- `nums.size()` 是 size_t，与 int i 比较会有符号警告。\n- 找不到答案时返回空 vector，题目保证有解，可以接受。\n\n',
  '## 改进建议\n\n循环变量改成 size_t：\n\n```cpp\nfor (size_t i = 0; i < nums.size(); ++i) {\n```\n\n其余已经最优。\n',
];

const DEBUG = [
  '## 错误原因\n\nWrong Answer 表示输出和预期不一致。输入 nums = [3,3]，target = 6 时返回了 []，预期 [0,1]：代码在存入哈希表之前没有先查表，两个相同的数只留下一个下标。\n\n',
  '## 出错位置\n\n`seen[nums[i]] = i;` 写在 `seen.find(target - nums[i])` 之前，第二个 3 查到的是它自己。\n\n',
  '## 修复思路\n\n1. 先查 target - nums[i] 是否已在表里。\n2. 查不到再把当前数存进去。\n3. 这样重复元素也能配对。\n\n',
  '## 修正后的代码\n\n```cpp\nclass Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        unordered_map<int,int> seen;\n        for (int i = 0; i < nums.size(); ++i) {\n            auto it = seen.find(target - nums[i]); // 先查再存\n            if (it != seen.end()) return {it->second, i};\n            seen[nums[i]] = i;\n        }\n        return {};\n    }\n};\n```\n\n把查表放到存表前面，[3,3] 就能返回 [0,1]。\n',
];

const received = [];
const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const parsed = JSON.parse(body);
    received.push({ url: req.url, auth: req.headers.authorization, body: parsed });
    const text = parsed.messages.map((m) => m.content).join('\n');
    const canned = text.includes('运行结果：') ? DEBUG : text.includes('我的代码') ? REVIEW : HINTS;
    res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream' });
    let i = 0;
    const tick = () => {
      if (i < canned.length) {
        for (const piece of canned[i].match(/[\s\S]{1,7}/g)) {
          res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: piece } }] }) + '\n\n');
        }
        i++;
        setTimeout(tick, 150);
      } else { res.write('data: [DONE]\n\n'); res.end(); }
    };
    tick();
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = 'http://127.0.0.1:' + server.address().port + '/v1';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-copilot-'));
const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false, executablePath: EXE,
  args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--disable-blink-features=AutomationControlled'],
});
let worker = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
const extId = new URL(worker.url()).host;
await worker.evaluate((s) => chrome.storage.local.set({ settings: s }), { baseUrl, apiKey: 'test-key-123', model: 'mock-model' });

const lc = await ctx.newPage();
await lc.goto('https://leetcode.com/problems/two-sum/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await lc.waitForSelector('[data-track-load="description_content"]', { timeout: 60000 });
await lc.waitForSelector('#editor button', { timeout: 60000 });
const [tab] = await worker.evaluate(() => chrome.tabs.query({ url: 'https://leetcode.com/problems/*' }));

const panel = await ctx.newPage();
await panel.setViewportSize({ width: 360, height: 900 });
panel.on('console', (m) => console.log('[panel]', m.type(), m.text()));
panel.on('pageerror', (e) => console.log('[panel error]', e.message));
await panel.goto('chrome-extension://' + extId + '/sidepanel.html?tabId=' + tab.id);
await panel.waitForFunction(() => document.querySelector('#title')?.textContent.includes('Two Sum'), null, { timeout: 30000 });
console.log('title:', await panel.locator('#title').textContent());

await panel.click('#generate');
await panel.waitForFunction(() => document.querySelectorAll('#sections details').length === 4, null, { timeout: 30000 });
await panel.waitForFunction(() => document.querySelector('#sections').textContent.includes('哈希表把查找降到'), null, { timeout: 30000 });
await panel.waitForFunction(() => document.querySelector('#status').textContent.includes('完成'), null, { timeout: 30000 });
assert.equal(await panel.$eval('#stop', (e) => getComputedStyle(e).display), 'none', 'stop hidden after done');
assert.equal(await panel.$eval('#generate', (e) => getComputedStyle(e).display !== 'none'), true, 'generate visible after done');
const summaries = await panel.$$eval('#sections details > summary', (els) => els.map((e) => e.textContent.trim()));
assert.deepEqual(summaries, ['提示 1', '提示 2', '提示 3', '完整代码']);
const openStates = await panel.$$eval('#sections details', (els) => els.map((e) => e.open));
assert.deepEqual(openStates, [false, false, false, false], 'all collapsed after streaming');

await panel.click('#sections details:nth-of-type(1) > summary');
assert.equal(await panel.$eval('#sections details:nth-of-type(1)', (e) => e.open), true);
const hint1 = await panel.$eval('#sections details:nth-of-type(1)', (e) => e.textContent);
assert.match(hint1, /两层循环/);
await panel.click('#sections details:nth-of-type(4) > summary');
const code = await panel.$eval('#sections details:nth-of-type(4) code', (e) => e.textContent);
assert.match(code, /unordered_map<int,int> seen/);
assert.match(code, /## 这一行不是标题/, 'heading-looking line inside fence stays in code');
const rawHtml = await panel.$eval('#sections', (e) => e.innerHTML);
assert.ok(!rawHtml.includes('<script'), 'no script tags');

assert.equal(received.length, 1);
assert.equal(received[0].url, '/v1/chat/completions');
assert.equal(received[0].auth, 'Bearer test-key-123');
assert.equal(received[0].body.model, 'mock-model');
assert.equal(received[0].body.stream, true);
const userMsg = received[0].body.messages.map((m) => m.content).join('\n');
assert.match(userMsg, /Two Sum/);
assert.match(userMsg, /C\+\+/);
assert.match(userMsg, /indices of the two numbers/);

await panel.reload();
await panel.waitForFunction(() => document.querySelector('#title')?.textContent.includes('Two Sum'), null, { timeout: 30000 });
await panel.waitForFunction(() => document.querySelectorAll('#sections details').length === 4, null, { timeout: 30000 });
assert.match(await panel.locator('#status').textContent(), /^已缓存 · /, 'reload shows the cached result');
assert.equal(received.length, 1, 'cached reload sends no request');
assert.deepEqual(await panel.$$eval('#sections details', (els) => els.map((e) => e.open)), [false, false, false, false], 'all collapsed after reload');

await panel.click('#generate');
for (let i = 0; received.length < 2; i++) {
  assert.ok(i < 600, 'regenerate sent no request');
  await new Promise((r) => setTimeout(r, 50));
}
await panel.waitForFunction(() => document.querySelector('#status').textContent.includes('完成'), null, { timeout: 30000 });

await panel.click('#tab-review');
await panel.click('#evaluate');
await panel.waitForFunction(() => document.querySelectorAll('#sections-review details').length === 4, null, { timeout: 30000 });
await panel.waitForFunction(() => document.querySelector('#status-review').textContent.includes('完成'), null, { timeout: 30000 });
assert.deepEqual(await panel.$$eval('#sections-review details > summary', (els) => els.map((e) => e.textContent.trim())), ['正确性', '复杂度', '问题', '改进建议']);
assert.deepEqual(await panel.$$eval('#sections-review details', (els) => els.map((e) => e.open)), [true, true, true, true], 'review sections open by default');
assert.equal(received.length, 3);
const reviewUser = received[2].body.messages.at(-1).content;
assert.match(reviewUser, /class Solution/, 'review request carries the editor code');
assert.match(reviewUser, /我的代码（C\+\+）/);
await panel.click('#sections-review details:nth-of-type(1) > summary');
assert.equal(await panel.$eval('#sections-review details:nth-of-type(1)', (e) => e.open), false, 'closed review section stays closed');

await lc.evaluate(() => {
  const tab = document.querySelector('.flexlayout__tab[data-layout-path="/c1/ts1/t1"]');
  tab.innerHTML = '<div><span data-e2e-locator="console-result">Wrong Answer</span></div><div>Input</div><pre>nums = [3,3]\ntarget = 6</pre><div>Output</div><pre>[]</pre><div>Expected</div><pre>[0,1]</pre>';
  tab.style.display = 'block';
});
await panel.click('#tab-debug');
await panel.waitForFunction(() => document.querySelector('#result-input').value.includes('Wrong Answer'), null, { timeout: 30000 });
assert.match(await panel.inputValue('#result-input'), /\[0,1\]/, 'auto-read result carries the expected output');
await panel.click('#debug-run');
await panel.waitForFunction(() => document.querySelectorAll('#sections-debug details').length === 4, null, { timeout: 30000 });
await panel.waitForFunction(() => document.querySelector('#status-debug').textContent.includes('完成'), null, { timeout: 30000 });
assert.deepEqual(await panel.$$eval('#sections-debug details > summary', (els) => els.map((e) => e.textContent.trim())), ['错误原因', '出错位置', '修复思路', '修正后的代码']);
assert.deepEqual(await panel.$$eval('#sections-debug details', (els) => els.map((e) => e.open)), [true, true, true, false], 'explanations open, corrected code collapsed');
assert.equal(received.length, 4);
const debugUser = received[3].body.messages.at(-1).content;
assert.match(debugUser, /Wrong Answer/, 'debug request carries the verdict');
assert.match(debugUser, /\[0,1\]/, 'debug request carries the expected output');
assert.match(debugUser, /class Solution/, 'debug request carries the editor code');
await panel.screenshot({ path: path.join(OUT, 'leetcode-copilot-debug.png'), fullPage: true, animations: 'disabled' });
console.log('screenshot:', path.join(OUT, 'leetcode-copilot-debug.png'));
assert.equal(await panel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll at 360px on the debug tab');
await panel.fill('#result-input', '');
await panel.click('#debug-run');
await panel.waitForFunction(() => document.querySelector('#status-debug').textContent.includes('没有运行结果'), null, { timeout: 10000 });
assert.equal(received.length, 4, 'blank result sends no request');

await panel.click('#tab-hints');
await panel.screenshot({ path: path.join(OUT, 'leetcode-copilot-panel.png'), fullPage: true, animations: 'disabled' });
console.log('screenshot:', path.join(OUT, 'leetcode-copilot-panel.png'));
await panel.click('#tab-review');
await panel.screenshot({ path: path.join(OUT, 'leetcode-copilot-review.png'), fullPage: true, animations: 'disabled' });
console.log('screenshot:', path.join(OUT, 'leetcode-copilot-review.png'));
await panel.click('#tab-hints');
await panel.emulateMedia({ colorScheme: 'dark' });
await panel.screenshot({ path: path.join(OUT, 'leetcode-copilot-dark.png'), fullPage: true, animations: 'disabled' });
console.log('screenshot:', path.join(OUT, 'leetcode-copilot-dark.png'));
assert.equal(await panel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll at 360px');
await panel.goto('chrome-extension://' + extId + '/options.html');
await panel.waitForFunction(() => document.querySelector('#baseUrl')?.value.startsWith('http'), null, { timeout: 10000 });
await panel.screenshot({ path: path.join(OUT, 'leetcode-copilot-options.png'), fullPage: true, animations: 'disabled' });
console.log('screenshot:', path.join(OUT, 'leetcode-copilot-options.png'));
console.log('E2E OK. request:', JSON.stringify({ auth: received[0].auth, model: received[0].body.model, roles: received[0].body.messages.map((m) => m.role) }));
await ctx.close();
server.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
