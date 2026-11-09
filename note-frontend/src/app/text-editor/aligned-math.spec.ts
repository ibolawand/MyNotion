import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { AlignedBlockMath, ALIGNED_TEXT } from './aligned-math';

describe('alignment', () => {
  let editor: Editor;
  const make = (content: string) => {
    editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit, AlignedBlockMath, ALIGNED_TEXT], content });
    return editor;
  };
  afterEach(() => editor?.destroy());

  it('a formula on its own line is left by default, like the text', () => {
    make('<div data-type="block-math" data-latex="x^2"></div>');
    expect(editor.getHTML()).toContain('data-align="left"');
    expect((editor.view.dom.querySelector('[data-type="block-math"]') as HTMLElement).dataset['align']).toBe('left');
  });

  it('keeps a chosen alignment when the note is saved and opened again', () => {
    make('<div data-type="block-math" data-latex="x^2" data-align="center"></div>');
    expect(editor.getHTML()).toContain('data-align="center"');
    editor.commands.command(({ tr }) => { tr.setNodeAttribute(0, 'align', 'right'); return true; });
    expect((editor.view.dom.querySelector('[data-type="block-math"]') as HTMLElement).dataset['align']).toBe('right');
    expect(make(editor.getHTML()).getHTML()).toContain('data-align="right"');
  });

  it('text and headings can be aligned too', () => {
    make('<h2>Title</h2><p>text</p>');
    editor.chain().setTextSelection(2).setTextAlign('center').run();
    expect(editor.getHTML()).toContain('<h2 style="text-align: center;">Title</h2>');
  });

  it('an edited formula shows the new formula right away (not only after reopening the note)', () => {
    make('<div data-type="block-math" data-latex="x^2" data-align="center"></div>');
    editor.commands.updateBlockMath({ pos: 0, latex: 'y^3' });
    const shown = editor.view.dom.querySelector('[data-type="block-math"]') as HTMLElement;
    expect(shown.textContent).toContain('y');
    expect(shown.textContent).not.toContain('x');
    expect(shown.dataset['align']).toBe('center');
  });
});
