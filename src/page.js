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
