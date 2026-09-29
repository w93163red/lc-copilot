export function readProblem() {
  const match = /^https:\/\/leetcode\.com\/problems\/([^/?#]+)/.exec(location.href);
  if (!match) return null;
  const description = document.querySelector('[data-track-load="description_content"]');
  const editorButtons = Array.from(document.querySelectorAll('#editor button'), (b) => b.textContent.trim());
  return {
    slug: match[1],
    title: document.title.replace(/\s*-\s*LeetCode\s*$/, ''),
    description: description ? description.innerText : '',
    editorButtons,
  };
}
