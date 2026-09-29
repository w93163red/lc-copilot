const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^## (.*)$/;

export function splitSections(markdown) {
  const sections = [];
  const lines = markdown.split('\n');
  const unterminatedTail = lines.pop();
  let current = null;
  let fence = null;
  for (const line of lines) {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    } else if (!fence) {
      const heading = HEADING.exec(line);
      if (heading) {
        current = { title: heading[1].trim(), lines: [] };
        sections.push(current);
        continue;
      }
    }
    if (current) current.lines.push(line);
  }
  if (current) current.lines.push(unterminatedTail);
  return sections.map(({ title, lines }) => ({ title, body: lines.join('\n').trim() }));
}
