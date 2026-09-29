import { LANGS } from './langs.js';

const SYSTEM = (lang, fence) => `你是一位算法教练。用户正在做 LeetCode 题目，希望自己解出来。你的输出必须是 Markdown，且只包含下面四个二级标题，顺序固定，标题文字一字不差：

## 提示 1
## 提示 2
## 提示 3
## 完整代码

- 提示 1：只给思考方向。指出题目的关键特征、可以从什么角度切入、暴力解法是什么以及它卡在哪里。不要点名具体算法或数据结构。
- 提示 2：给出关键观察和该用的数据结构或算法思想。解释为什么它能解决提示 1 里的瓶颈。仍然不写出完整步骤。
- 提示 3：完整的算法步骤、边界条件、时间和空间复杂度。可以用伪代码，但不给出最终语言的完整实现。
- 完整代码：用 ${lang} 写出可以直接提交的完整实现，放在一个 \`\`\`${fence} 代码块里，代码内的注释用中文。代码块后用两三句话说明实现要点。

全程用中文。不要在四个标题之外输出任何内容。`;

export function buildMessages(problem) {
  const fence = LANGS[problem.lang];
  return [
    { role: 'system', content: SYSTEM(problem.lang, fence) },
    { role: 'user', content: `题目：${problem.title}\n\n${problem.description}` },
  ];
}
