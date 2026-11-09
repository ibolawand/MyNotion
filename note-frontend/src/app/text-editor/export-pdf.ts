/** "Save as PDF": the note as it's drawn on screen, without the editing bits, for the app to print on white paper
 *  (note/src/pdf.ts). Formulas go along already drawn, so they look exactly like in the note. */

/** A copy of the note's drawn HTML that prints well: every toggle open, ticks kept, no editing handles. */
export function printableHtml(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  // a ticked box is a property, not an attribute: carry it over
  const boxes = root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  copy.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box, i) => {
    if (boxes[i]?.checked) box.setAttribute('checked', ''); else box.removeAttribute('checked');
    box.setAttribute('disabled', '');
  });
  copy.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  // handles to resize pictures and table columns, the find marks' extras, empty-line placeholders
  copy.querySelectorAll('[data-resize-handle], .column-resize-handle, .ProseMirror-gapcursor, .ProseMirror-separator')
    .forEach(el => el.remove());
  copy.querySelectorAll('[data-placeholder]').forEach(el => el.removeAttribute('data-placeholder'));
  // toggles: their text is printed too
  copy.querySelectorAll('div[data-type="details"]').forEach(el => el.classList.add('is-open'));
  copy.querySelectorAll('[hidden]').forEach(el => el.removeAttribute('hidden'));
  copy.querySelectorAll('.find-hit').forEach(el => el.classList.remove('find-hit', 'current'));
  return copy.innerHTML;
}

/** KaTeX's own styles (its fonts and the layout of formulas), taken from the app's style sheet. */
export function katexCss(sheets: StyleSheetList = document.styleSheets): string {
  const out: string[] = [];
  for (const sheet of Array.from(sheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      const text = rule.cssText;
      if (rule instanceof CSSFontFaceRule ? /KaTeX/.test(text) : /\.katex/.test((rule as CSSStyleRule).selectorText ?? '')) {
        out.push(text);
      }
    }
  }
  return out.join('\n');
}
