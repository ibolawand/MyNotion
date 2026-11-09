import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { AriaRange, ariaRange, clearAriaRange, rangeHtml, setAriaRange } from './aria-range';

describe('The part Aria is working on', () => {
  let editor: Editor;
  const make = (content: string) => editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit, AriaRange], content });
  afterEach(() => editor?.destroy());
  const text = () => { const r = ariaRange(editor.state)!; return editor.state.doc.textBetween(r.from, r.to, '\n'); };

  it('marks the range and draws it', () => {
    make('<p>one two three</p>');
    setAriaRange(editor, 5, 8);
    expect(ariaRange(editor.state)).toEqual({ from: 5, to: 8 });
    expect(text()).toBe('two');
    expect(editor.view.dom.querySelector('.aria-range')?.textContent).toBe('two');
  });

  it('follows the text when something is typed before it', () => {
    make('<p>one two three</p>');
    setAriaRange(editor, 5, 8);
    editor.commands.insertContentAt(1, 'zero ');
    expect(text()).toBe('two');
  });

  it('does not grow when something is typed right at its edges', () => {
    make('<p>one two three</p>');
    setAriaRange(editor, 5, 8);
    editor.commands.insertContentAt(8, '!');
    editor.commands.insertContentAt(5, '?');
    expect(text()).toBe('two');
  });

  it('is gone when its text is deleted', () => {
    make('<p>one two three</p>');
    setAriaRange(editor, 5, 8);
    editor.commands.deleteRange({ from: 4, to: 9 });
    expect(ariaRange(editor.state)).toBeNull();
  });

  it('is gone when cleared, and with a new note', () => {
    make('<p>one two three</p>');
    setAriaRange(editor, 5, 8);
    clearAriaRange(editor);
    expect(ariaRange(editor.state)).toBeNull();
    expect(editor.view.dom.querySelector('.aria-range')).toBeNull();
    setAriaRange(editor, 5, 8);
    editor.commands.setContent('<p>another note</p>');
    expect(ariaRange(editor.state)).toBeNull();
  });

  it('refuses an empty or impossible range', () => {
    make('<p>one</p>');
    setAriaRange(editor, 2, 2);
    expect(ariaRange(editor.state)).toBeNull();
    setAriaRange(editor, 2, 99);
    expect(ariaRange(editor.state)).toBeNull();
  });

  it('gives the selection as HTML: part of a line, whole blocks, list items', () => {
    make('<p>one <strong>two</strong> three</p><ul><li><p>first</p></li><li><p>second</p></li></ul>');
    expect(rangeHtml(editor.state, { from: 5, to: 8 })).toBe('<strong>two</strong>');
    expect(rangeHtml(editor.state, { from: 1, to: 14 })).toBe('one <strong>two</strong> three');
    const all = rangeHtml(editor.state, { from: 0, to: editor.state.doc.content.size });
    expect(all).toContain('<p>one <strong>two</strong> three</p>');
    expect(all).toContain('<li><p>second</p></li>');
  });
});
