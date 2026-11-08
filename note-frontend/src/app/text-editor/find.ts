/** Find & replace inside the open note (Ctrl+F / Ctrl+H). The matches are marked in the text (the current one
 *  brighter); the bar itself lives in the text editor. A match never runs across two paragraphs or through a formula. */
import { Extension } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { EditorState, Plugin, PluginKey, TextSelection, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface FindMatch { from: number; to: number; }
export interface FindState { query: string; caseSensitive: boolean; matches: FindMatch[]; current: number; }

export const findKey = new PluginKey<FindState>('find');
const EMPTY: FindState = { query: '', caseSensitive: false, matches: [], current: 0 };

/** Every place `query` appears. Text maps one character to one position, and anything else inside a line
 *  (a formula, a date chip) counts as one character no word contains, so positions come straight from the index. */
export function findMatches(doc: PMNode, query: string, caseSensitive = false): FindMatch[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const found: FindMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    node.forEach(child => { text += child.isText ? child.text! : '￼'.repeat(child.nodeSize); });
    const hay = caseSensitive ? text : text.toLowerCase();
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) {
      found.push({ from: pos + 1 + i, to: pos + 1 + i + needle.length });
    }
    return false;
  });
  return found;
}

/** The match at or after `pos` (wrapping round to the first), so a search starts where you are in the note. */
export function matchFrom(matches: FindMatch[], pos: number): number {
  const i = matches.findIndex(m => m.from >= pos);
  return i < 0 ? 0 : i;
}

function withMatches(s: FindState, doc: PMNode, current: number): FindState {
  const matches = findMatches(doc, s.query, s.caseSensitive);
  return { ...s, matches, current: matches.length ? Math.min(Math.max(current, 0), matches.length - 1) : 0 };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    find: {
      /** Search for `query` (empty clears); the current match is the first one from the cursor on. */
      setFind: (query: string, caseSensitive?: boolean) => ReturnType;
      /** Next (+1) or previous (-1) match, wrapping round; it's selected and scrolled to. */
      findStep: (dir: 1 | -1) => ReturnType;
      /** Replace the current match and move on to the next. */
      replaceCurrent: (text: string) => ReturnType;
      /** Replace every match in one step (one Ctrl+Z undoes all of them). */
      replaceAll: (text: string) => ReturnType;
      clearFind: () => ReturnType;
    };
  }
}

const setMeta = (tr: Transaction, s: FindState) => tr.setMeta(findKey, s);
export const findState = (state: EditorState): FindState => findKey.getState(state) ?? EMPTY;

/** Selects match `i` (so Esc leaves the cursor there) and keeps it in view. */
function select(tr: Transaction, m: FindMatch | undefined) {
  if (m) tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView();
}

export const FindReplace = Extension.create({
  name: 'find',

  addCommands() {
    return {
      setFind: (query, caseSensitive = false) => ({ state, tr, dispatch }) => {
        const s = withMatches({ ...EMPTY, query, caseSensitive }, state.doc, 0);
        s.current = matchFrom(s.matches, state.selection.from);
        if (dispatch) setMeta(tr, s);
        return true;
      },
      findStep: dir => ({ state, tr, dispatch }) => {
        const s = findState(state);
        if (!s.matches.length) return false;
        const current = (s.current + dir + s.matches.length) % s.matches.length;
        if (dispatch) { setMeta(tr, { ...s, current }); select(tr, s.matches[current]); }
        return true;
      },
      replaceCurrent: text => ({ state, tr, dispatch }) => {
        const s = findState(state), m = s.matches[s.current];
        if (!m) return false;
        if (dispatch) {
          text ? tr.insertText(text, m.from, m.to) : tr.delete(m.from, m.to);
          const next = withMatches(s, tr.doc, s.current);
          setMeta(tr, next);
          select(tr, next.matches[next.current]);
        }
        return true;
      },
      replaceAll: text => ({ state, tr, dispatch }) => {
        const s = findState(state);
        if (!s.matches.length) return false;
        if (dispatch) {
          for (const m of [...s.matches].reverse()) text ? tr.insertText(text, m.from, m.to) : tr.delete(m.from, m.to);
          setMeta(tr, withMatches(s, tr.doc, 0));
        }
        return true;
      },
      clearFind: () => ({ tr, dispatch }) => {
        if (dispatch) setMeta(tr, EMPTY);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin<FindState>({
      key: findKey,
      state: {
        init: () => EMPTY,
        apply: (tr, s) => {
          const set = tr.getMeta(findKey) as FindState | undefined;
          if (set) return set;
          return tr.docChanged && s.query ? withMatches(s, tr.doc, s.current) : s;   // typing keeps the marks right
        },
      },
      props: {
        decorations: state => {
          const s = findState(state);
          if (!s.matches.length) return DecorationSet.empty;
          return DecorationSet.create(state.doc, s.matches.map((m, i) =>
            Decoration.inline(m.from, m.to, { class: i === s.current ? 'find-hit current' : 'find-hit' })));
        },
      },
    })];
  },
});
