import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TabKey } from './tab-key';

describe('Tab key', () => {
  let editor: Editor;
  const make = (content: string, at: number) => {
    editor = new Editor({ element: document.createElement('div'),
      extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), TabKey], content });
    editor.commands.setTextSelection(at);
    return editor;
  };
  afterEach(() => editor?.destroy());

  it('puts a tab space at the cursor in normal text', () => {
    make('<p>Name:Lala</p>', 6);
    expect(editor.commands.keyboardShortcut('Tab')).toBeTrue();
    expect(editor.getText()).toBe('Name:\tLala');
  });

  it('Shift+Tab takes the tab back out', () => {
    make('<p>\tindented</p>', 2);
    expect(editor.commands.keyboardShortcut('Shift-Tab')).toBeTrue();
    expect(editor.getText()).toBe('indented');
  });

  it('Shift+Tab with no tab before the cursor changes nothing and stays in the note', () => {
    make('<p>plain</p>', 3);
    expect(editor.commands.keyboardShortcut('Shift-Tab')).toBeTrue();
    expect(editor.getText()).toBe('plain');
  });

  it('in a list, Tab moves the item one level in and Shift+Tab back out', () => {
    make('<ul><li><p>one</p></li><li><p>two</p></li></ul>', 10);
    editor.commands.keyboardShortcut('Tab');
    expect(editor.getHTML()).toContain('<ul><li><p>one</p><ul><li><p>two</p></li></ul></li></ul>');
    editor.commands.keyboardShortcut('Shift-Tab');
    expect(editor.getHTML()).toContain('<ul><li><p>one</p></li><li><p>two</p></li></ul>');
  });

  it('works for to-do lists too', () => {
    make('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>a</p></li>' +
         '<li data-type="taskItem" data-checked="false"><p>b</p></li></ul>', 8);
    editor.commands.keyboardShortcut('Tab');
    expect(editor.getHTML()).toContain('<p>a</p><ul data-type="taskList">');
  });
});
