import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { InlineMath } from '@tiptap/extension-mathematics';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { FindReplace, findMatches, findState, matchFrom } from './find';
import { Callout, nextKind } from './callout';
import { activeHeading, outlineOf } from './outline';

describe('find & replace', () => {
  let editor: Editor;
  const make = (content: string) =>
    (editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit, InlineMath, FindReplace], content }));
  afterEach(() => editor?.destroy());

  it('finds every match, ignoring case unless asked', () => {
    make('<p>Cat and cat</p><p>CAT</p>');
    expect(findMatches(editor.state.doc, 'cat').length).toBe(3);
    expect(findMatches(editor.state.doc, 'cat', true).length).toBe(1);
    const [first] = findMatches(editor.state.doc, 'and');
    expect(editor.state.doc.textBetween(first.from, first.to)).toBe('and');
  });

  it('positions stay right after a formula in the line, and a match never runs through it', () => {
    make('<p>a <span data-type="inline-math" data-latex="x"></span> b x</p>');
    const [m] = findMatches(editor.state.doc, 'b');
    expect(editor.state.doc.textBetween(m.from, m.to)).toBe('b');
    expect(findMatches(editor.state.doc, 'a  b').length).toBe(0);
  });

  it('starts at the match from the cursor on, and steps round in both directions', () => {
    make('<p>one two one two one</p>');
    editor.commands.setTextSelection(6);
    editor.commands.setFind('one');
    expect(findState(editor.state).current).toBe(1);
    editor.commands.findStep(1);
    editor.commands.findStep(1);
    expect(findState(editor.state).current).toBe(0);
    editor.commands.findStep(-1);
    expect(findState(editor.state).current).toBe(2);
    expect(matchFrom([], 4)).toBe(0);
  });

  it('replaces one, then all, and keeps the marks up to date while typing', () => {
    make('<p>red red red</p>');
    editor.commands.setTextSelection(1);
    editor.commands.setFind('red');
    editor.commands.replaceCurrent('blue');
    expect(editor.getText()).toBe('blue red red');
    expect(findState(editor.state).matches.length).toBe(2);
    editor.commands.replaceAll('green');
    expect(editor.getText()).toBe('blue green green');
    editor.commands.insertContentAt(1, 'red ');         // still searching for "red": the new one is marked
    expect(findState(editor.state).matches.length).toBe(1);
    editor.commands.setFind('green');
    editor.commands.insertContentAt(1, 'green ');
    expect(findState(editor.state).matches.length).toBe(3);
  });

  it('replace all is one undo step', () => {
    make('<p>a a a</p>');
    editor.commands.setFind('a');
    editor.commands.replaceAll('b');
    expect(editor.getText()).toBe('b b b');
    editor.commands.undo();
    expect(editor.getText()).toBe('a a a');
  });
});

describe('callouts and toggles', () => {
  let editor: Editor;
  const make = (content: string) => (editor = new Editor({ element: document.createElement('div'),
    extensions: [StarterKit, Callout, Details.configure({ persist: true }), DetailsSummary, DetailsContent], content }));
  afterEach(() => editor?.destroy());

  it('a callout wraps the line, switches kind, and comes back out', () => {
    make('<p>remember this</p>');
    editor.chain().setTextSelection(3).setCallout('tip').run();
    expect(editor.getHTML()).toMatch(/^<div data-kind="tip" data-type="callout"><p>remember this<\/p><\/div>/);
    editor.commands.setCallout('warning');
    expect(editor.getHTML()).toContain('data-kind="warning"');
    editor.commands.unsetCallout();
    expect(editor.getHTML()).toMatch(/^<p>remember this<\/p>/);
    expect(editor.getHTML()).not.toContain('callout');
  });

  it('a saved callout opens again with its kind; an unknown kind falls back to a note', () => {
    expect(make('<div data-type="callout" data-kind="important"><p>x</p></div>').getHTML()).toContain('data-kind="important"');
    expect(make('<div data-type="callout" data-kind="bogus"><p>x</p></div>').getHTML()).toContain('data-kind="note"');
    expect(nextKind('warning')).toBe('note');
  });

  it('clicking the icon switches to the next kind', () => {
    make('<div data-type="callout" data-kind="note"><p>x</p></div>');
    (editor.view.dom.querySelector('.callout-icon') as HTMLButtonElement).click();
    expect(editor.getHTML()).toContain('data-kind="tip"');
  });

  it('a toggle keeps whether it is open when the note is saved', () => {
    make('<details open><summary>Question</summary><div data-type="detailsContent"><p>Answer</p></div></details>');
    expect(editor.getHTML()).toContain('<details open="">');
    expect(make('<details><summary>Q</summary><div data-type="detailsContent"><p>A</p></div></details>').getHTML())
      .not.toContain('open');
  });
});

describe('outline', () => {
  it('lists the headings in order, also inside callouts, and skips empty ones', () => {
    const editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit, Callout],
      content: '<h1>Intro</h1><p>x</p><h2></h2><div data-type="callout" data-kind="tip"><h3>Inside</h3></div><h2>End</h2>' });
    expect(outlineOf(editor.state.doc).map(h => `${h.level}:${h.text}`)).toEqual(['1:Intro', '3:Inside', '2:End']);
    editor.destroy();
  });

  it('the active heading is the last one scrolled past', () => {
    expect(activeHeading([10, 200, 400], 250)).toBe(1);
    expect(activeHeading([10, 200, 400], 5)).toBe(-1);
  });
});
