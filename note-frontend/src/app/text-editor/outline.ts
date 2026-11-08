/** The outline: the note's headings in order, for the sidebar that jumps around a long note. */
import { Node as PMNode } from '@tiptap/pm/model';

export interface OutlineItem { level: number; text: string; pos: number; }

export function outlineOf(doc: PMNode): OutlineItem[] {
  const items: OutlineItem[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const text = node.textContent.trim();
      if (text) items.push({ level: node.attrs['level'], text, pos });
      return false;
    }
    return !node.isTextblock;      // headings can sit inside callouts and toggles too
  });
  return items;
}

/** The heading you're reading: the last one whose top has passed `line` (a y position on screen). */
export function activeHeading(tops: number[], line: number): number {
  let active = -1;
  tops.forEach((top, i) => { if (top <= line) active = i; });
  return active;
}
