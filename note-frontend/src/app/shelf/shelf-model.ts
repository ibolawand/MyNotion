/** The home screen as a shelf: folders are books, notes without a folder lie on the desk, and the notes Aria keeps
 *  (her lists and what she knows) are a stack of their own. Pure functions: no Angular, no database. */
import { Folder, Note } from '../../model/models';

/** Aria's own notes, by title (as Aria finds them). Add a title here and it joins her stack. */
export const ARIA_NOTES = ['Shopping list', 'Inbox', 'What Aria knows about me'];
export const DEFAULT_COLOUR = '#4ade80';
const DARK_INK = '#11131c', LIGHT_INK = '#ffffff';

export interface Book { folder: Folder; colour: string; ink: '#11131c' | '#ffffff'; count: number; spine: number; }
/** A part of a book's contents: the book itself (depth 0) or one of its subfolders. */
export interface Section { folder: Folder; depth: number; notes: Note[]; }
export interface Shelf { books: Book[]; slips: Note[]; aria: Note[]; }

/** How thick a book is, in px: one note is still a book, fifty aren't a wall. */
export function spineWidth(count: number): number {
  return Math.max(34, Math.min(88, 28 + 6 * count));
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Dark or white text, whichever is easier to read on this cover (WCAG contrast). */
export function inkFor(colour: string): '#11131c' | '#ffffff' {
  const l = luminance(colour);
  const contrast = (other: number) => (Math.max(l, other) + 0.05) / (Math.min(l, other) + 0.05);
  return contrast(luminance(DARK_INK)) >= contrast(1) ? DARK_INK : LIGHT_INK;
}

function coverColour(colour: unknown): string {
  return typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour.trim()) ? colour.trim().toLowerCase() : DEFAULT_COLOUR;
}

/** The top-level folder (the book) a folder belongs to; null = no such folder: the note lies on the desk. */
export function bookIdOf(folderId: number | undefined | null, folders: Folder[]): number | null {
  const byId = new Map(folders.map(f => [f.id, f]));
  let folder = folderId ? byId.get(folderId) : undefined;
  const seen = new Set<number>();
  while (folder) {
    if (seen.has(folder.id)) return null;            // folders pointing at each other: not a book
    seen.add(folder.id);
    if (folder.parentID == null) return folder.id;
    folder = byId.get(folder.parentID);
  }
  return null;
}

function isAriaNote(note: Note): boolean {
  const title = (note.title ?? '').trim().toLowerCase();
  return ARIA_NOTES.some(t => t.toLowerCase() === title);
}

function changed(note: Note): number {
  const raw = (note as any).updated_at || (note as any).created_at;
  const time = raw ? new Date(String(raw).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? '' : 'Z')).getTime() : NaN;
  return isNaN(time) ? 0 : time;
}

function inOrder(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || changed(b) - changed(a) || (b.id ?? 0) - (a.id ?? 0));
}

export function buildShelf(notes: Note[], folders: Folder[]): Shelf {
  const counts = new Map<number, number>();
  const slips: Note[] = [], aria: Note[] = [];
  for (const note of notes) {
    const book = bookIdOf(note.folderID, folders);
    if (book != null) counts.set(book, (counts.get(book) ?? 0) + 1);
    else (isAriaNote(note) ? aria : slips).push(note);
  }
  const books = folders.filter(f => bookIdOf(f.id, folders) === f.id).map(folder => {
    const colour = coverColour(folder.colour), count = counts.get(folder.id) ?? 0;
    return { folder, colour, ink: inkFor(colour), count, spine: spineWidth(count) };
  });
  return { books, slips, aria };
}

/** What's in a book: its own notes, then each subfolder (and theirs) as a section. */
export function contentsOf(bookId: number, notes: Note[], folders: Folder[]): Section[] {
  const sections: Section[] = [];
  const walk = (folder: Folder, depth: number) => {
    if (sections.some(s => s.folder.id === folder.id)) return;
    sections.push({ folder, depth, notes: inOrder(notes.filter(n => n.folderID === folder.id)) });
    for (const child of folders.filter(f => f.parentID === folder.id)) walk(child, depth + 1);
  };
  const book = folders.find(f => f.id === bookId);
  if (book) walk(book, 0);
  return sections;
}

/** The note that was edited last: the one a book opens on. */
export function latestNote(sections: Section[]): Note | null {
  let latest: Note | null = null;
  for (const note of sections.flatMap(s => s.notes)) {
    if (!latest || changed(note) > changed(latest)) latest = note;
  }
  return latest;
}

/** When a note was last edited: "14:02" today, "Yesterday", "Tue", or "3 Nov". long: full date and time.
 *  SQLite's CURRENT_TIMESTAMP is UTC, written without a zone. */
export function edited(note: Note, long = false): string {
  const time = changed(note);
  if (!time) return '';
  const d = new Date(time);
  if (long) return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  if (days <= 0) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
