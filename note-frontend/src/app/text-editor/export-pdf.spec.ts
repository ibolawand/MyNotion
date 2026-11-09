import { katexCss, printableHtml } from './export-pdf';

describe('save as PDF', () => {
  it('prints toggles open, keeps ticks, and leaves the editing handles out', () => {
    const root = document.createElement('div');
    root.setAttribute('contenteditable', 'true');
    root.innerHTML = '<ul data-type="taskList"><li data-checked="true"><label><input type="checkbox"></label><div><p>done</p></div></li>'
      + '<li data-checked="false"><label><input type="checkbox" checked></label><div><p>open</p></div></li></ul>'
      + '<div data-type="details"><button></button><div><summary>Q</summary><div data-type="detailsContent" hidden><p>A</p></div></div></div>'
      + '<div class="note-image"><img src="mynotion-image://image/3"><div data-resize-handle="top-left"></div></div>'
      + '<p class="is-empty" data-placeholder="Type / for blocks"></p><p>x <span class="find-hit current">y</span></p>';
    const boxes = root.querySelectorAll('input');
    (boxes[0] as HTMLInputElement).checked = true;
    (boxes[1] as HTMLInputElement).checked = false;    // unticked since the page was drawn
    const out = document.createElement('div');
    out.innerHTML = printableHtml(root);
    const printed = out.querySelectorAll('input');
    expect(printed[0].hasAttribute('checked')).toBe(true);
    expect(printed[1].hasAttribute('checked')).toBe(false);
    expect(out.querySelector('[data-type="details"]')!.classList).toContain('is-open');
    expect(out.querySelector('[hidden]')).toBeNull();
    expect(out.querySelector('[data-resize-handle]')).toBeNull();
    expect(out.querySelector('[data-placeholder]')).toBeNull();
    expect(out.querySelector('.find-hit')).toBeNull();
    expect(out.querySelector('img')!.getAttribute('src')).toBe('mynotion-image://image/3');
    expect(root.querySelector('[data-resize-handle]')).not.toBeNull();     // the note itself is untouched
  });

  it('takes KaTeX\'s styles from the page (formulas and their fonts), nothing else', () => {
    const style = document.createElement('style');
    style.textContent = '@font-face { font-family: KaTeX_Main; src: url(media/KaTeX_Main-Regular.woff2); }'
      + '.katex { font-size: 1.21em; } .sidebar { color: red; }';
    document.head.appendChild(style);
    const css = katexCss();
    style.remove();
    expect(css).toContain('KaTeX_Main');
    expect(css).toContain('.katex');
    expect(css).not.toContain('sidebar');
  });
});
