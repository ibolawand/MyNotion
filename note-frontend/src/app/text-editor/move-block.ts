/** Alt+↑ / Alt+↓: move the block the cursor is in (a paragraph, heading, formula, picture, callout… or one item of
 *  a list) above the one before it / below the one after it, keeping the cursor in it. Inside a list only the item
 *  moves, and it stays in its list; a block inside a callout or toggle stays inside it. */
import { Extension } from '@tiptap/core';
import { EditorState, NodeSelection, TextSelection, Transaction } from '@tiptap/pm/state';

const ITEMS = ['listItem', 'taskItem'];

/** The depth of the block to move: the nearest list item, else the outermost block (or the block inside a
 *  callout / toggle / quote the cursor is in, so it doesn't jump out of it). */
function blockDepth(state: EditorState): number {
  const { $from } = state.selection;
  if (state.selection instanceof NodeSelection) {
    // a selected picture or formula: the node itself (one level below the selection's parent)
    return $from.depth + 1;
  }
  for (let d = $from.depth; d > 0; d--) {
    if (ITEMS.includes($from.node(d).type.name)) return d;
  }
  // the text block itself, but a whole table from inside any cell, and a whole toggle from its title
  for (let d = 1; d <= $from.depth; d++) {
    if ($from.node(d).type.name === 'table') return d;
  }
  if ($from.parent.type.name === 'detailsSummary') return $from.depth - 1;
  return $from.depth;
}

export function moveBlock(state: EditorState, dir: -1 | 1, dispatch?: (tr: Transaction) => void): boolean {
  const sel = state.selection;
  const depth = blockDepth(state);
  if (depth < 1) return false;
  const $pos = sel instanceof NodeSelection ? state.doc.resolve(sel.from + 1) : sel.$from;
  const parentDepth = depth - 1;
  const parent = $pos.node(parentDepth);
  const index = $pos.index(parentDepth);
  const target = index + dir;
  if (target < 0 || target >= parent.childCount) return false;
  // a toggle's title and text, and a table's rows, stay where they are
  if (['details', 'table', 'tableRow'].includes(parent.type.name)) return false;
  if (!dispatch) return true;

  const start = $pos.before(depth);
  const node = parent.child(index);
  const end = start + node.nodeSize;
  const other = parent.child(target);
  const tr = state.tr;
  if (dir === -1) {
    const otherStart = start - other.nodeSize;
    tr.delete(start, end).insert(otherStart, node);
    const shift = otherStart - start;
    mapSelection(tr, sel, shift);
  } else {
    tr.delete(start, end);
    const insertAt = start + other.nodeSize;
    tr.insert(insertAt, node);
    mapSelection(tr, sel, other.nodeSize);
  }
  dispatch(tr.scrollIntoView());
  return true;
}

function mapSelection(tr: Transaction, sel: EditorState['selection'], shift: number) {
  if (sel instanceof NodeSelection) {
    tr.setSelection(NodeSelection.create(tr.doc, sel.from + shift));
  } else {
    tr.setSelection(TextSelection.create(tr.doc, sel.anchor + shift, sel.head + shift));
  }
}

export const MoveBlock = Extension.create({
  name: 'moveBlock',
  addKeyboardShortcuts() {
    return {
      'Alt-ArrowUp': () => moveBlock(this.editor.state, -1, tr => this.editor.view.dispatch(tr)),
      'Alt-ArrowDown': () => moveBlock(this.editor.state, 1, tr => this.editor.view.dispatch(tr)),
    };
  },
});
