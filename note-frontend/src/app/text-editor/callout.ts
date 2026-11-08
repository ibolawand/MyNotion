/** Callouts: a coloured box around a few lines, for something to notice (a note, a tip, something important, a
 *  warning). Clicking the icon switches the kind. Saved as <div data-type="callout" data-kind="tip">…</div>. */
import { Node, mergeAttributes } from '@tiptap/core';

export type CalloutKind = 'note' | 'tip' | 'important' | 'warning';
export const CALLOUT_KINDS: { kind: CalloutKind; label: string; icon: string }[] = [
  { kind: 'note', label: 'Note', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>' },
  { kind: 'tip', label: 'Tip', icon: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>' },
  { kind: 'important', label: 'Important', icon: '<path d="M12 4v10M12 19v.5"/>' },
  { kind: 'warning', label: 'Warning', icon: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17v.5"/>' },
];
const kindOf = (v: string | null): CalloutKind => (CALLOUT_KINDS.some(k => k.kind === v) ? v as CalloutKind : 'note');
export const nextKind = (k: CalloutKind): CalloutKind =>
  CALLOUT_KINDS[(CALLOUT_KINDS.findIndex(c => c.kind === k) + 1) % CALLOUT_KINDS.length].kind;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Puts the current line(s) in a callout, or changes the kind of the one the cursor is in. */
      setCallout: (kind?: CalloutKind) => ReturnType;
      /** Takes the lines back out of the callout. */
      unsetCallout: () => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: 'note',
        parseHTML: (el: HTMLElement) => kindOf(el.getAttribute('data-kind')),
        renderHTML: (attrs: Record<string, any>) => ({ 'data-kind': attrs['kind'] }),
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="callout"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0]; },

  addCommands() {
    return {
      setCallout: (kind = 'note') => ({ editor, commands }) =>
        editor.isActive(this.name) ? commands.updateAttributes(this.name, { kind }) : commands.wrapIn(this.name, { kind }),
      unsetCallout: () => ({ commands }) => commands.lift(this.name),
    };
  },

  // the icon is a button outside the text: a click switches note → tip → important → warning
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.dataset['type'] = 'callout';
      const icon = document.createElement('button');
      icon.type = 'button';
      icon.contentEditable = 'false';
      icon.className = 'callout-icon';
      const body = document.createElement('div');
      body.className = 'callout-body';
      dom.append(icon, body);
      const show = (kind: CalloutKind) => {
        const k = CALLOUT_KINDS.find(c => c.kind === kind)!;
        dom.dataset['kind'] = kind;
        icon.title = `${k.label}: click for another kind`;
        icon.setAttribute('aria-label', icon.title);
        icon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${k.icon}</svg>`;
      };
      show(node.attrs['kind']);
      icon.addEventListener('mousedown', e => e.preventDefault());
      icon.addEventListener('click', () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (pos === undefined || !editor.isEditable) return;
        const current = editor.state.doc.nodeAt(pos);
        if (current?.type.name === this.name) {
          editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, 'kind', nextKind(current.attrs['kind'])));
        }
      });
      return {
        dom,
        contentDOM: body,
        update: updated => {
          if (updated.type.name !== this.name) return false;
          show(updated.attrs['kind']);
          return true;
        },
        ignoreMutation: m => m.type !== 'selection' && icon.contains(m.target as globalThis.Node),
      };
    };
  },
});
