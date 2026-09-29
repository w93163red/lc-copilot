const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^## (.*)$/;

export function splitSections(markdown) {
  const sections = [];
  const lines = markdown.split('\n');
  let current = null;
  let fence = null;
  lines.forEach((line, i) => {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    } else if (!fence) {
      const heading = HEADING.exec(line);
      // The unterminated last line may still be growing ("## 提示" → "## 提示 2").
      if (heading && i < lines.length - 1) {
        current = { title: heading[1].trim(), lines: [] };
        sections.push(current);
        return;
      }
    }
    if (current) current.lines.push(line);
  });
  return sections.map(({ title, lines }) => ({ title, body: lines.join('\n').trim() }));
}
