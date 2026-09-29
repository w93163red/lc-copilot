# LeetCode Copilot

Chrome 侧边栏扩展。打开一道 leetcode.com 题目，点击「生成提示」，扩展把题面发给一个 OpenAI 兼容接口，流式返回三层递进提示和一份完整代码。提示默认折叠，想看哪层再展开，避免一眼看到答案。

## 安装（加载已解压的扩展程序）

1. 打开 `chrome://extensions`，右上角开启「开发者模式」。
2. 点「加载已解压的扩展程序」，选择本仓库目录。
3. 点击工具栏图标即可在当前窗口打开侧边栏。

## 配置

右键图标选「选项」，或在侧边栏点「设置」，填写：

- **Base URL**：OpenAI 兼容接口地址，不含 `/chat/completions`，例如 `https://api.openai.com/v1` 或本地 `http://localhost:11434/v1`。
- **API Key**：请求头 `Authorization: Bearer <key>`。
- **模型**：例如 `gpt-4o-mini`。

点「保存」时扩展会申请访问该接口域名的权限（默认只有 leetcode.com）。先保存再点「测试连接」，它会发一次非流式的小请求并显示结果。设置存在 `chrome.storage.local`，不会上传到任何地方。

## 提示的结构

模型被要求只输出四个固定的二级标题，扩展按标题切成四个可折叠区块：

1. **提示 1**：只给思考方向，不点名算法或数据结构。
2. **提示 2**：关键观察和该用的数据结构或算法思想。
3. **提示 3**：完整步骤、边界条件、复杂度，可用伪代码。
4. **完整代码**：按编辑器当前选择的语言给出可直接提交的实现，附「复制」按钮。

流式输出过程中区块逐个出现，已展开的区块在刷新时保持展开。切换到别的题目再切回来，之前的结果仍在（仅内存，关闭侧边栏即清空）。

## 开发

无构建步骤，纯 ES module。`npm test` 运行 `node --test`，覆盖分段、SSE 解析、提示词和设置校验。

端到端验证 `scripts/e2e.mjs`：起一个本地假 OpenAI 流式服务，用 Playwright 以未打包扩展方式启动有头 Chromium，打开真实的 leetcode.com 两数之和页面，在侧边栏页面里点「生成提示」，断言四个折叠区块、代码块内容和发出的请求。需要全局安装的 `@playwright/mcp`（或用 `PLAYWRIGHT_MODULE` 指向一个 playwright 包目录）和一个 Chromium 二进制：

```sh
CHROMIUM_PATH="/path/to/Chromium" node scripts/e2e.mjs
```
