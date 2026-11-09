/** Pictures in a note. The picture itself is stored by the app (in the database); the note keeps a link to it
 *  (<img src="mynotion-image://image/12">). Drag a corner to resize; left / centre / right like the other blocks.
 *  Only these links are taken: a picture from a web page or a data: URL pasted as HTML is left out, so a note
 *  never loads anything from the internet and never holds megabytes of picture text (Aria reads the notes too). */
import Image from '@tiptap/extension-image';

export const IMAGE_PREFIX = 'mynotion-image://image/';
export const ACCEPTED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const JUSTIFY: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };

export const NoteImage = Image.extend({
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

  parseHTML() {
    return [{ tag: `img[src^="${IMAGE_PREFIX}"]` }];
  },

  // no ![alt](https://…) typing shortcut: that would put a picture from the internet in the note
  addInputRules() {
    return [];
  },

  addNodeView() {
    const parent = this.parent?.();
    if (!parent) return null;
    return (props: any) => {
      const view: any = parent(props);
      const dom = view.dom as HTMLElement;
      const img = dom.querySelector('img');
      dom.classList.add('note-image');
      const show = (node: any) => {
        dom.dataset['align'] = node.attrs.align || 'left';
        dom.style.justifyContent = JUSTIFY[node.attrs.align] ?? 'flex-start';
      };
      show(props.node);
      // the stock view stays invisible until the picture loads: a missing one would be an invisible block
      img?.addEventListener('error', () => {
        dom.style.visibility = '';
        dom.style.pointerEvents = '';
        dom.classList.add('missing');
        img.alt = 'Picture not found';
      });
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

/** Pictures in the clipboard or among dropped files. */
export function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter(f => ACCEPTED.includes(f.type));
}

const MAX_SIDE = 2400;          // bigger photos are scaled down to this (still sharp on any screen)
const RECODE_ABOVE = 4 * 1024 * 1024;

/** The bytes to store: big photos are scaled down and re-saved, so a phone photo isn't 8 MB in the note.
 *  Screenshots stay PNG (sharp text); GIFs stay as they are (they may move). */
export async function prepareImage(file: File): Promise<Uint8Array> {
  const original = new Uint8Array(await file.arrayBuffer());
  if (file.type === 'image/gif') return original;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return original;                                   // let the app decide (it checks the bytes anyway)
  }
  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  if (scale === 1 && original.length <= RECODE_ABOVE) { bitmap.close(); return original; }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string, quality?: number) =>
    new Promise<Blob | null>(done => canvas.toBlob(done, type, quality));
  let blob = file.type === 'image/png' ? await encode('image/png') : null;
  if (!blob || blob.size > RECODE_ABOVE) blob = await encode(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp', 0.88);
  if (!blob || blob.size >= original.length) return original;
  return new Uint8Array(await blob.arrayBuffer());
}
