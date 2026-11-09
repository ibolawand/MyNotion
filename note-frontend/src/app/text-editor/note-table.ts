/** Tables: /table adds one with a header row. Drag a column's right edge to make it wider; Tab goes to the next
 *  cell (and adds a row at the end). While the cursor is in a table, the toolbar shows buttons to add and remove
 *  rows and columns (see text-editor.html). */
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { EditorState } from '@tiptap/pm/state';
import { TableMap } from '@tiptap/pm/tables';

export const NOTE_TABLE = [
  Table.configure({ resizable: true, cellMinWidth: 100, HTMLAttributes: { class: 'note-table' } }),
  TableRow,
  TableHeader,
  TableCell,
];

/** The size of the table the cursor is in, or null when it isn't in one. */
export function tableInfo(state: EditorState): { rows: number; cols: number; pos: number } | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === 'table') {
      const map = TableMap.get(node);
      return { rows: map.height, cols: map.width, pos: $from.before(d) };
    }
  }
  return null;
}
