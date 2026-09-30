import { LANGS } from './langs.js';

const CHAIN = `你是一位算法教练。用户正在做 LeetCode 题目。请按顺序列出把读者从暴力解带到最优解所需的每一个独立洞察，每条一句话，用中文。暴力解已经是最优解的题给空数组。两个总是同时出现的洞察算一个；读者仅凭上一个洞察无法自己得出的洞察要拆成两个。只输出一个 JSON 对象，形如 {"insights": ["…", "…"]}，不要解释，不要代码围栏。`;

const SYSTEM = (lang, fence, insights) => {
  const n = insights.length + 2;
  const headings = [...Array.from({ length: n }, (_, i) => `## 提示 ${i + 1}`), '## 完整代码'].join('\n');
  const levels = [
    '提示 1 只给思考方向：题目的关键特征、可以从什么角度切入、暴力解法是什么以及它卡在哪里。不要点名具体算法或数据结构。',
    ...insights.map((insight, k) => `提示 ${k + 2} 围绕这个洞察展开：「${insight}」。给出这个关键观察或该用的数据结构、算法思想，并解释它解决了上一层留下的哪个瓶颈。仍然不写出完整步骤。`),
    `提示 ${n} 给出完整的算法步骤、边界条件、时间和空间复杂度。可以用伪代码，但不给出最终语言的完整实现。`,
    `完整代码：用 ${lang} 写出可以直接提交的完整实现，放在一个 \`\`\`${fence} 代码块里，代码内的注释用中文。代码块后用两三句话说明实现要点。`,
  ];
  return `你是一位算法教练。用户正在做 LeetCode 题目，希望自己解出来。你的输出必须是 Markdown，只由下面 ${n} 个「提示」二级标题和最后一个「完整代码」二级标题组成，顺序和格式一字不差，必须恰好输出这 ${n} 个提示标题，不多不少：

${headings}

每一层只揭示一个新的洞察，用户看完任意一层都应该能带着这个新信息继续自己想，而不是被剧透。

${levels.map((line) => `- ${line}`).join('\n')}

全程用中文。不要在这些标题之外输出任何内容。`;
};

const REVIEW = (lang, fence) => `你是一位严格但友善的算法面试官。用户正在做 LeetCode 题目，下面是他为这道题用 ${lang} 写的代码。你的输出必须是 Markdown，只由下面四个二级标题组成，顺序和格式一字不差，不要在这些标题之外输出任何内容：

## 正确性
## 复杂度
## 问题
## 改进建议

- 正确性：判断代码是否正确。如果不正确，指出哪些用例会失败，并引用代码说明原因。
- 复杂度：给出时间和空间复杂度，并说明对这道题是否已经最优。
- 问题：列出 bug、遗漏的边界情况和代码风格问题，每条都指出对应的行或片段。
- 改进建议：给出具体的修改，可以附一小段 \`\`\`${fence} 代码块。如果代码已经最优，直接说明。

全程用中文。`;

const DEBUG = (lang, fence) => `你是一位耐心的算法助教。用户正在做 LeetCode 题目，他用 ${lang} 写的代码没有通过，先帮用户看懂错在哪，再引导修复。你的输出必须是 Markdown，只由下面四个二级标题组成，顺序和格式一字不差，不要在这些标题之外输出任何内容：

## 错误原因
## 出错位置
## 修复思路
## 修正后的代码

- 错误原因：解释运行结果里的判定或报错是什么意思，以及这段代码出错的根本原因；如果结果里有失败的输入，引用它。
- 出错位置：指出具体出错的行或表达式，原样引用。
- 修复思路：分步骤说明怎么改，这一节不要给出完整的修正代码。
- 修正后的代码：用 ${lang} 给出完整的修正实现，放在一个 \`\`\`${fence} 代码块里，代码内的注释用中文，代码块后用一两句话说明改动。

如果运行结果显示 Accepted，就在「错误原因」里说明代码已经通过，其余几节简短带过。全程用中文。`;

const problemMessage = (problem) => ({ role: 'user', content: `题目：${problem.title}\n\n${problem.description}` });

export function buildChainMessages(problem) {
  return [{ role: 'system', content: CHAIN }, problemMessage(problem)];
}

export function parseChain(text) {
  try {
    const { insights } = JSON.parse(text.replace(/^\s*```\w*\s*|\s*```\s*$/g, ''));
    return insights.filter((s) => typeof s === 'string' && s.trim());
  } catch {
    return null;
  }
}

export function buildMessages(problem, insights) {
  return [{ role: 'system', content: SYSTEM(problem.lang, LANGS[problem.lang], insights) }, problemMessage(problem)];
}

export function buildReviewMessages(problem, code) {
  const fence = LANGS[problem.lang];
  return [
    { role: 'system', content: REVIEW(problem.lang, fence) },
    { role: 'user', content: `题目：${problem.title}\n\n${problem.description}\n\n我的代码（${problem.lang}）：\n\`\`\`${fence}\n${code}\n\`\`\`` },
  ];
}

export function buildDebugMessages(problem, code, result) {
  const fence = LANGS[problem.lang];
  return [
    { role: 'system', content: DEBUG(problem.lang, fence) },
    { role: 'user', content: `题目：${problem.title}\n\n${problem.description}\n\n我的代码（${problem.lang}）：\n\`\`\`${fence}\n${code}\n\`\`\`\n\n运行结果：\n\`\`\`\n${result}\n\`\`\`` },
  ];
}
