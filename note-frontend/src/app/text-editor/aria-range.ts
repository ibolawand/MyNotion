/** The part of the note Aria is asked about ("Select text, ask Aria"). It stays marked while her card is open,
 *  even when the cursor leaves the note for the card's text box, and it follows the text when something is
 *  typed elsewhere. If the marked text itself is deleted, or another note is loaded, the mark is gone. */
import { Extension, getHTMLFromFragment } from '@tiptap/core';
import { EditorState, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Editor } from '@tiptap/core';

export interface Range { from: number; to: number; }

const key = new PluginKey<Range | null>('ariaRange');

export const ariaRange = (state: EditorState): Range | null => key.getState(state) ?? null;

export function setAriaRange(editor: Editor, from: number, to: number) {
  const size = editor.state.doc.content.size;
  const range = from < to && from >= 0 && to <= size ? { from, to } : null;
  editor.view.dispatch(editor.state.tr.setMeta(key, { range }).setMeta('addToHistory', false));
}

export function clearAriaRange(editor: Editor) {
  if (editor.isDestroyed || !ariaRange(editor.state)) return;
  editor.view.dispatch(editor.state.tr.setMeta(key, { range: null }).setMeta('addToHistory', false));
}

/** The range as HTML, the way it is sent to Aria: part of one line gives just its text and marks, whole
 *  blocks give the blocks. */
export function rangeHtml(state: EditorState, range: Range): string {
  return getHTMLFromFragment(state.doc.slice(range.from, range.to).content, state.schema);
}

export const AriaRange = Extension.create({
  name: 'ariaRange',
  addProseMirrorPlugins() {
    return [new Plugin<Range | null>({
      key,
      state: {
        init: () => null,
        apply(tr, value) {
          const meta = tr.getMeta(key) as { range: Range | null } | undefined;
          if (meta) return meta.range;
          if (!value || !tr.docChanged) return value;
          // typing at its edges stays outside; a range whose text is gone (or a whole new note) ends
          const from = tr.mapping.map(value.from, 1), to = tr.mapping.map(value.to, -1);
          const whole = tr.steps.length === 1 && tr.mapping.mapResult(value.from, 1).deleted && tr.mapping.mapResult(value.to, -1).deleted;
          return from < to && !whole ? { from, to } : null;
        },
      },
      props: {
        decorations(state) {
          const r = key.getState(state);
          return r ? DecorationSet.create(state.doc, [Decoration.inline(r.from, r.to, { class: 'aria-range' })]) : null;
        },
      },
    })];
  },
});
