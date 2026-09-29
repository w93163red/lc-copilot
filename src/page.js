export function readProblem() {
  const match = /^https:\/\/leetcode\.com\/problems\/([^/?#]+)/.exec(location.href);
  if (!match) return null;
  const description = document.querySelector('[data-track-load="description_content"]');
  const editorButtons = Array.from(document.querySelectorAll('#editor button'), (b) => b.textContent.trim());
  const badge = document.evaluate(
    "//div[normalize-space(.)='Easy' or normalize-space(.)='Medium' or normalize-space(.)='Hard']",
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
  ).singleNodeValue;
  return {
    slug: match[1],
    title: document.title.replace(/\s*-\s*LeetCode\s*$/, ''),
    description: description ? description.innerText : '',
    difficulty: badge ? badge.textContent.trim() : '',
    editorButtons,
  };
}

export function readEditorCode() {
  const models = globalThis.monaco?.editor?.getModels() ?? [];
  const model = models.find((m) => m.getLanguageId() !== 'plaintext');
  return model ? model.getValue() : '';
}

export function readRunResult() {
  const VERDICT = /^(Accepted|Wrong Answer|Runtime Error|Compile Error|Time Limit Exceeded|Memory Limit Exceeded|Output Limit Exceeded)\b/m;
  try {
    const tabs = Array.from(document.querySelectorAll('.flexlayout__tab'));
    const node = document.querySelector('[data-e2e-locator="console-result"], [data-e2e-locator="submission-result"]')
      ?? [...tabs.filter((tab) => tab.dataset.layoutPath === '/c1/ts1/t1'), ...tabs].find((tab) => VERDICT.test(tab.innerText));
    if (!node) return '';
    const text = (node.closest('.flexlayout__tab') ?? node).innerText;
    return text.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 4000);
  } catch {
    return '';
  }
}
