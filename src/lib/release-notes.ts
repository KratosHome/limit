const blockTags = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'UL',
  'OL',
  'PRE',
  'BLOCKQUOTE',
  'DETAILS',
  'SUMMARY',
  'TR',
]);
const ignoredTags = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'MATH',
  'TEMPLATE',
  'NOSCRIPT',
]);

function nodeText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (ignoredTags.has(node.nodeName)) return '';
  if (node.nodeName === 'BR' || node.nodeName === 'HR') return '\n';
  const content = Array.from(node.childNodes, nodeText).join('');
  if (node.nodeName === 'LI') return `\n• ${content.trim()}\n`;
  if (blockTags.has(node.nodeName)) return `\n${content}\n`;
  if (node.nodeName === 'TD' || node.nodeName === 'TH') return `${content}\t`;
  return content;
}

export function releaseNotesText(notes: string): string {
  // Preserve plain text/Markdown supplied directly by update metadata.
  if (!/<\/?[a-z][^>]*>/i.test(notes)) return notes.trim();

  // GitHub's Atom feed supplies HTML. Template contents stay inert and are
  // never attached to the document; only extracted text reaches React.
  const template = document.createElement('template');
  template.innerHTML = notes;
  return nodeText(template.content)
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n[\t ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
