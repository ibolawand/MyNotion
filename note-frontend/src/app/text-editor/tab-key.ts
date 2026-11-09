/** Tab in a note works like in a word processor: in a list (or to-do list) it moves the item one level in, anywhere
 *  else it types a tab space. Shift+Tab undoes either. The key never leaves the note for the toolbar.
 *  Lower priority than the lists' own Tab handling, so nesting wins wherever it's possible. */
import { Extension } from '@tiptap/core';

export const TabKey = Extension.create({
  name: 'tabKey',
  priority: 10,

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const ed = this.editor;
        if (ed.can().sinkListItem('listItem')) return ed.commands.sinkListItem('listItem');
        if (ed.can().sinkListItem('taskItem')) return ed.commands.sinkListItem('taskItem');
        return ed.commands.insertContent('\t');
      },
      'Shift-Tab': () => {
        const ed = this.editor;
        if (ed.can().liftListItem('listItem')) return ed.commands.liftListItem('listItem');
        if (ed.can().liftListItem('taskItem')) return ed.commands.liftListItem('taskItem');
        const { from, empty } = ed.state.selection;
        if (empty && ed.state.doc.textBetween(Math.max(0, from - 1), from) === '\t') {
          ed.commands.deleteRange({ from: from - 1, to: from });
        }
        return true;                         // stay in the note either way
      },
    };
  },
});
