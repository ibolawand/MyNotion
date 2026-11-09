import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Callout } from './callout';
import { MoveBlock, moveBlock } from './move-block';
import { NOTE_TABLE, tableInfo } from './note-table';
import { TabKey } from './tab-key';
import { NOTE_TYPING } from './typing';
import { matchNotes, noteHref, noteIdOf } from './note-links';

describe('moving blocks (Alt+↑ / Alt+↓)', () => {
  let editor: Editor;
  const make = (content: string) => (editor = new Editor({ element: document.createElement('div'),
    extensions: [StarterKit.configure({ trailingNode: false }), TaskList, TaskItem.configure({ nested: true }), Callout, MoveBlock, ...NOTE_TABLE,
      Details.configure({ persist: true }), DetailsSummary, DetailsContent], content }));
  const up = () => moveBlock(editor.state, -1, tr => editor.view.dispatch(tr));
  const down = () => moveBlock(editor.state, 1, tr => editor.view.dispatch(tr));
  const at = (text: string) => {           // the cursor into the middle of the first text "text"
    let found = -1;
    editor.state.doc.descendants((n, pos) => {
      if (found < 0 && n.isText && n.text!.includes(text)) found = pos + n.text!.indexOf(text) + 1;
    });
    editor.commands.setTextSelection(found);
  };
  afterEach(() => editor?.destroy());

  it('moves a paragraph up and down, and the cursor goes with it', () => {
    make('<p>one</p><h2>two</h2><p>three</p>');
    at('three');
    expect(up()).toBe(true);
    expect(editor.getHTML()).toBe('<p>one</p><p>three</p><h2>two</h2>');
    expect(editor.state.selection.$from.parent.textContent).toBe('three');
    up();
    expect(editor.getHTML()).toBe('<p>three</p><p>one</p><h2>two</h2>');
    expect(up()).toBe(false);                        // already at the top: nothing happens
    down(); down();
    expect(editor.getHTML()).toBe('<p>one</p><h2>two</h2><p>three</p>');
    expect(down()).toBe(false);
  });

  it('moves one list item inside its list, with what is nested under it', () => {
    make('<ul><li><p>a</p><ul><li><p>a1</p></li></ul></li><li><p>b</p></li></ul>');
    at('b');
    up();
    expect(editor.getHTML()).toBe('<ul><li><p>b</p></li><li><p>a</p><ul><li><p>a1</p></li></ul></li></ul>');
  });

  it('a to-do keeps its tick when moved', () => {
    make('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p></li>'
       + '<li data-type="taskItem" data-checked="false"><p>open</p></li></ul>');
    at('done');
    down();
    const items: any[] = editor.getJSON().content![0].content!;
    expect(items.map(i => [i.content![0].content![0].text, i.attrs!['checked']])).toEqual([['open', false], ['done', true]]);
  });

  it('stays inside a callout, and moves a whole toggle from its title', () => {
    make('<div data-type="callout" data-kind="tip"><p>x</p><p>y</p></div><p>after</p>');
    at('y');
    up();
    expect(editor.getHTML()).toContain('<p>y</p><p>x</p></div><p>after</p>');
    expect(up()).toBe(false);                        // doesn't leave the box
    make('<p>top</p><details><summary>Q</summary><div data-type="detailsContent"><p>A</p></div></details>');
    at('Q');
    up();
    expect(editor.getHTML()).toMatch(/^<details.*<\/details><p>top<\/p>$/);
  });

  it('moves a whole table from any cell', () => {
    make('<p>top</p><table><tbody><tr><td><p>c1</p></td><td><p>c2</p></td></tr></tbody></table>');
    at('c2');
    up();
    expect(editor.getHTML()).toMatch(/^<table.*<\/table><p>top<\/p>$/);
  });
});

describe('tables', () => {
  let editor: Editor;
  const make = (content = '<p></p>') => (editor = new Editor({ element: document.createElement('div'),
    extensions: [StarterKit.configure({ trailingNode: false }), TabKey, ...NOTE_TABLE], content }));
  afterEach(() => editor?.destroy());

  it('Tab goes to the next cell (not a tab space), and adds a row after the last cell', () => {
    make();
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    const tab = () => editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    const cellText = () => editor.state.selection.$from.node(-1).type.name;
    tab();
    expect(cellText()).toBe('tableHeader');
    tab();
    tab();
    expect(cellText()).toBe('tableCell');
    expect(editor.getText()).not.toContain('\t');
    tab();
    expect(tableInfo(editor.state)).toEqual(jasmine.objectContaining({ rows: 3, cols: 2 }));
  });

  it('a new table has a header row, and rows and columns can be added and removed', () => {
    make();
    editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
    expect(tableInfo(editor.state)).toEqual(jasmine.objectContaining({ rows: 3, cols: 3 }));
    expect(editor.getHTML()).toContain('<th');
    editor.commands.addRowAfter();
    editor.commands.addColumnAfter();
    expect(tableInfo(editor.state)).toEqual(jasmine.objectContaining({ rows: 4, cols: 4 }));
    editor.commands.deleteRow();
    editor.commands.deleteColumn();
    expect(tableInfo(editor.state)).toEqual(jasmine.objectContaining({ rows: 3, cols: 3 }));
    editor.commands.deleteTable();
    expect(tableInfo(editor.state)).toBeNull();
  });

  it('a saved table opens again the same, with its column widths', () => {
    const html = '<table style="min-width: 75px;"><colgroup><col style="width: 120px;"><col style="min-width: 25px;"></colgroup>'
      + '<tbody><tr><th colspan="1" rowspan="1" colwidth="120"><p>Name</p></th><th colspan="1" rowspan="1"><p>Mark</p></th></tr>'
      + '<tr><td colspan="1" rowspan="1" colwidth="120"><p>Bio</p></td><td colspan="1" rowspan="1"><p>5.5</p></td></tr></tbody></table>';
    make(html);
    const again = make(editor.getHTML()).getHTML();
    expect(again).toContain('colwidth="120"');
    expect(again).toContain('<p>5.5</p>');
  });
});

describe('sub- and superscript', () => {
  it('H₂O and x² in the text', () => {
    const editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit.configure({ trailingNode: false }), Subscript, Superscript],
      content: '<p>H2O x2</p>' });
    editor.chain().setTextSelection({ from: 2, to: 3 }).toggleSubscript().setTextSelection({ from: 6, to: 7 }).toggleSuperscript().run();
    expect(editor.getHTML()).toBe('<p>H<sub>2</sub>O x<sup>2</sup></p>');
    editor.destroy();
  });
});

describe('typing shortcuts', () => {
  let editor: Editor;
  /** types like a person: each character goes through the input rules */
  const type = (text: string) => {
    for (const ch of text) {
      const { from, to } = editor.state.selection;
      const view = editor.view;
      const done = view.someProp('handleTextInput', f => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)));
      if (!done) view.dispatch(view.state.tr.insertText(ch, from, to));
    }
  };
  beforeEach(() => editor = new Editor({ element: document.createElement('div'),
    extensions: [StarterKit.configure({ trailingNode: false }), ...NOTE_TYPING], content: '<p></p>' }));
  afterEach(() => editor.destroy());

  it('turns arrows and comparisons into their signs', () => {
    type('a -> b => c <=> d <-> e != f <= g >= h ~= i');
    expect(editor.getText()).toBe('a → b ⇒ c ⇔ d ↔ e ≠ f ≤ g ≥ h ≈ i');
  });

  it('leaves quotes, (c) and ^2 alone (German quotes, exercise labels, formulas)', () => {
    type('"Hallo" (c) x^2 $$x^2$$');
    expect(editor.getText()).toBe('"Hallo" (c) x^2 $$x^2$$');
  });

  it('Backspace right after brings back what was typed', () => {
    type('a =>');
    editor.commands.undoInputRule();
    expect(editor.getText()).toBe('a =>');
  });

  it('never inside code', () => {
    editor.commands.setCodeBlock();
    type('a => b');
    expect(editor.getText()).toBe('a => b');
  });
});

describe('links between notes', () => {
  const notes: any[] = [
    { id: 1, title: 'Matrizen', updated_at: '2026-11-01' },
    { id: 2, title: 'Vektoren und Matrizen', updated_at: '2026-11-08' },
    { id: 3, title: 'Biologie: Zelle', updated_at: '2026-11-05' },
    { id: 4, title: '   ', updated_at: '2026-11-09' },
    { id: 5, title: 'Mathe Prüfung', updated_at: '2026-11-07' },
  ];

  it('finds notes by the start of the title first, then by a word, never the current one', () => {
    expect(matchNotes(notes, 'mat', 99).map(n => n.id)).toEqual([5, 1, 2]);   // both start with it: newer first
    expect(matchNotes(notes, 'zel', 99).map(n => n.id)).toEqual([3]);
    expect(matchNotes(notes, 'mat', 1).map(n => n.id)).toEqual([5, 2]);
    expect(matchNotes(notes, '', 99).map(n => n.id)).toEqual([2, 5, 3, 1]);      // recent first, no empty titles
    expect(matchNotes(notes, 'xyz', 99)).toEqual([]);
  });

  it('reads only its own links', () => {
    expect(noteIdOf(noteHref(12))).toBe(12);
    expect(noteIdOf('mynotion://note/12/../x')).toBeNull();
    expect(noteIdOf('https://example.com/note/12')).toBeNull();
    expect(noteIdOf(undefined)).toBeNull();
  });

  it('a note link survives saving', () => {
    const editor = new Editor({ element: document.createElement('div'),
      extensions: [StarterKit.configure({ link: { protocols: ['mynotion'] } })],
      content: '<p>see <a href="mynotion://note/3">Biologie</a></p>' });
    expect(editor.getHTML()).toContain('href="mynotion://note/3"');
    editor.destroy();
  });
});
