/** Pasting Markdown (from ChatGPT, a README, another notes app): "## Title", "**bold**", "- item", "- [ ] to-do",
 *  tables and formulas ($…$, $$…$$, \(…\), \[…\]) become real headings, lists, to-dos, tables and formulas instead of
 *  showing the symbols. Only plain-text pastes that look like Markdown; anything copied from a web page keeps its own
 *  formatting. HTML inside the Markdown is shown as text, never run or loaded. */
import { Marked } from 'marked';

const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    // raw HTML in the pasted text stays text
    html: ({ text }) => escapeHtml(text),
  },
});

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Is this plain text Markdown worth converting? (A single plain sentence isn't.) */
export function looksLikeMarkdown(text: string): boolean {
  if (!text || text.length > 500_000) return false;
  const block = /^(#{1,6} \S|\s*[-*+] \S|\s*\d+[.)] \S|> |```|\|.*\|\s*$|\s*[-*+] \[[ xX]\] )/m;
  const inline = /\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([^\n]+?\\\)/;
  return block.test(text) || inline.test(text);
}

/** The Markdown as HTML the editor reads (its own formula, to-do and table elements). */
export function markdownToHtml(text: string): string {
  const formulas: { latex: string; block: boolean }[] = [];
  const keep = (latex: string, block: boolean) => {
    formulas.push({ latex: latex.trim(), block });
    const mark = `MNFORMULA${formulas.length - 1}X`;
    return block ? `\n\n${mark}\n\n` : mark;
  };
  // formulas first, so Markdown doesn't touch their _ * \ (code stays as it is: split it out)
  const parts = text.replace(/\r\n?/g, '\n').split(/(```[\s\S]*?```|`[^`\n]*`)/);
  const prepared = parts.map((part, i) => i % 2 ? part : part
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, f) => keep(f, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, f) => keep(f, true))
    .replace(/\\\(([^\n]+?)\\\)/g, (_, f) => keep(f, false))
    // $x$, but not money ("$5 and $6"): no space just inside the $ signs, no digit right after the closing one
    .replace(/(^|[^\\$\w])\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\d$])/g, (_, pre, f) => pre + keep(f, false)),
  ).join('');

  const doc = new DOMParser().parseFromString(`<body>${md.parse(prepared) as string}</body>`, 'text/html');

  // formulas back in, as the editor's own elements
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const t of texts) {
    if (!/MNFORMULA\d+X/.test(t.data)) continue;
    const frag = doc.createDocumentFragment();
    for (const piece of t.data.split(/(MNFORMULA\d+X)/)) {
      const m = /^MNFORMULA(\d+)X$/.exec(piece);
      if (!m) { if (piece) frag.append(piece); continue; }
      const f = formulas[+m[1]];
      const el = doc.createElement(f.block ? 'div' : 'span');
      el.setAttribute('data-type', f.block ? 'block-math' : 'inline-math');
      el.setAttribute('data-latex', f.latex);
      frag.append(el);
    }
    const parent = t.parentElement;
    // a formula alone in its paragraph: the block replaces the paragraph
    if (parent?.tagName === 'P' && parent.childNodes.length === 1 && frag.childNodes.length === 1
        && (frag.firstChild as Element).tagName === 'DIV') {
      parent.replaceWith(frag);
    } else {
      t.replaceWith(frag);
    }
  }

  // "- [ ] x" lists: the editor's to-do lists
  doc.querySelectorAll('ul').forEach(ul => {
    const items = Array.from(ul.children).filter(li => li.tagName === 'LI');
    const box = (li: Element) => li.querySelector(':scope > input[type="checkbox"], :scope > p:first-child > input[type="checkbox"]');
    if (!items.length || !items.every(box)) return;
    ul.setAttribute('data-type', 'taskList');
    for (const li of items) {
      const input = box(li) as HTMLInputElement;
      li.setAttribute('data-type', 'taskItem');
      li.setAttribute('data-checked', String(input.hasAttribute('checked')));
      input.remove();
      if (!li.querySelector(':scope > p')) {
        const p = doc.createElement('p');
        while (li.firstChild && !(li.firstChild instanceof Element && ['UL', 'OL'].includes(li.firstChild.tagName))) p.append(li.firstChild);
        p.innerHTML = p.innerHTML.trim();
        li.prepend(p);
      }
    }
  });
  return doc.body.innerHTML;
}
