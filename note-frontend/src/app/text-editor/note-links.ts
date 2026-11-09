/** Links between notes: type [[ and pick a note; the link (mynotion://note/12) opens that note when clicked.
 *  The link text is the note's title at the time it was linked. */
import { Note } from '../../model/models';

export const NOTE_LINK = 'mynotion://note/';

export const noteHref = (id: number) => NOTE_LINK + id;

/** The note id in a note link (null for any other link). */
export function noteIdOf(href: string | null | undefined): number | null {
  const m = /^mynotion:\/\/note\/(\d{1,12})$/.exec(href ?? '');
  return m ? Number(m[1]) : null;
}

/** The notes for "[[query": titles starting with it first, then containing it; most recently changed first.
 *  Never the note being written in, nor notes without a title. */
export function matchNotes(notes: Note[], query: string, currentId: number | undefined, max = 8): Note[] {
  const q = query.trim().toLowerCase();
  const recent = (n: Note) => String((n as any).updated_at ?? (n as any).updatedAt ?? '');
  const rank = (n: Note) => {
    const t = (n.title ?? '').toLowerCase();
    if (!q) return 1;
    if (t.startsWith(q)) return 0;
    if (t.split(/[\s\-_(]+/).some(w => w.startsWith(q))) return 1;
    return t.includes(q) ? 2 : 9;
  };
  return notes
    .filter(n => n.id != null && n.id !== currentId && (n.title ?? '').trim() && rank(n) < 9)
    .sort((a, b) => rank(a) - rank(b) || recent(b).localeCompare(recent(a)))
    .slice(0, max);
}
