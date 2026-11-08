/** Where things sit on the line: text and headings (TipTap's TextAlign) and formulas on their own line (an `align`
 *  attribute on the block formula, saved as data-align). Everything starts left; centre and right are chosen per line. */
import { BlockMath } from '@tiptap/extension-mathematics';
import TextAlign from '@tiptap/extension-text-align';

export type Align = 'left' | 'center' | 'right';
export const ALIGNS: { align: Align; label: string }[] = [
  { align: 'left', label: 'Align left' }, { align: 'center', label: 'Centre' }, { align: 'right', label: 'Align right' },
];

export const ALIGNED_TEXT = TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] });

export const AlignedBlockMath = BlockMath.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'left',
        parseHTML: (el: HTMLElement) => (['center', 'right'].includes(el.getAttribute('data-align') ?? '') ? el.getAttribute('data-align') : 'left'),
        renderHTML: (attrs: Record<string, any>) => ({ 'data-align': attrs['align'] }),
      },
    };
  },

  // the formula's own view ignores extra attributes, so the alignment is put on it here (and kept up to date)
  addNodeView() {
    const parent = this.parent?.();
    if (!parent) return null;
    return (props: any) => {
      const view: any = parent(props);
      const show = (node: any) => ((view.dom as HTMLElement).dataset['align'] = node.attrs.align || 'left');
      show(props.node);
      const update = view.update?.bind(view);
      view.update = (node: any, ...rest: any[]) => {
        const ok = update ? update(node, ...rest) : node.type === props.node.type;
        if (ok) show(node);
        return ok;
      };
      return view;
    };
  },
});
