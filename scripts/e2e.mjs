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

const CANNED = [
  '## 提示 1\n\n先想暴力：两层循环枚举每一对。瓶颈在哪？\n\n',
  '## 提示 2\n\n关键观察：对每个 x，只需要知道 target - x 是否出现过。用哈希表记录“见过的数 → 下标”。\n\n',
  '## 提示 3\n\n一次遍历。对每个 nums[i]，查 target - nums[i] 是否在表里；在就返回，不在就把 nums[i] 存进去。时间 O(n)，空间 O(n)。\n\n',
  '## 完整代码\n\n```cpp\n// ## 这一行不是标题\nclass Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        unordered_map<int,int> seen;\n        for (int i = 0; i < nums.size(); ++i) {\n            auto it = seen.find(target - nums[i]);\n            if (it != seen.end()) return {it->second, i};\n            seen[nums[i]] = i;\n        }\n        return {};\n    }\n};\n```\n\n哈希表把查找降到 O(1)。\n',
];

const received = [];
const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    received.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
    res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream' });
    let i = 0;
    const tick = () => {
      if (i < CANNED.length) {
        for (const piece of CANNED[i].match(/[\s\S]{1,7}/g)) {
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

await panel.screenshot({ path: path.join(OUT, 'leetcode-copilot-panel.png'), fullPage: true });
console.log('screenshot:', path.join(OUT, 'leetcode-copilot-panel.png'));
console.log('E2E OK. request:', JSON.stringify({ auth: received[0].auth, model: received[0].body.model, roles: received[0].body.messages.map((m) => m.role) }));
await ctx.close();
server.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
