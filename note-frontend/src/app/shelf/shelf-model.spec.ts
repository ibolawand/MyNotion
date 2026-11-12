import { Folder, Note } from '../../model/models';
import { bookIdOf, buildShelf, contentsOf, inkFor, latestNote, spineWidth } from './shelf-model';

describe('shelf model', () => {
  const folder = (id: number, name: string, colour: any = '#4ade80', parentID: number | null = null): Folder =>
    ({ id, name, colour, parentID, userID: 1 });
  const note = (id: number, title: string, folderID: number, extra: Partial<Note> & { updated_at?: string } = {}): Note =>
    ({ id, title, content: '', categoryID: 0, folderID, ...extra } as Note);

  const folders = [folder(3, 'Math'), folder(5, 'German', '#ef4444'), folder(11, 'Sub', '#4ade80', 3)];
  const notes = [
    note(8, 'Schularbeiten', 3, { updated_at: '2026-11-01 10:00:00' }),
    note(9, 'Matrizen', 3, { updated_at: '2026-11-05 10:00:00' }),
    note(13, 'Differentialgleichung', 11, { updated_at: '2026-11-10 10:00:00' }),
    note(20, 'Aufsatz', 5, { updated_at: '2026-11-02 10:00:00' }),
    note(1, 'sada', 0),
    note(5, 'shopping LIST', 0),
    note(30, 'orphan', 99),
    note(31, 'Inbox', 5),
  ];

  it('makes one book per top-level folder and counts notes in its sections', () => {
    const shelf = buildShelf(notes, folders);
    expect(shelf.books.map(b => b.folder.name)).toEqual(['Math', 'German']);
    expect(shelf.books[0].count).toBe(3);
    expect(shelf.books[0].spine).toBe(spineWidth(3));
    expect(shelf.books[1].count).toBe(2);        // an Aria-titled note inside a folder stays in its book
  });

  it('puts notes without a folder on the desk, Aria\'s own in her stack', () => {
    const shelf = buildShelf(notes, folders);
    expect(shelf.aria.map(n => n.id)).toEqual([5]);
    expect(shelf.slips.map(n => n.id)).toEqual([1, 30]);      // no folder, and a folder that no longer exists
  });

  it('book thickness grows with the notes, within limits', () => {
    expect(spineWidth(0)).toBe(34);
    expect(spineWidth(3)).toBe(46);
    expect(spineWidth(50)).toBe(88);
  });

  it('picks readable spine text and a default colour', () => {
    expect(inkFor('#4ade80')).toBe('#11131c');
    expect(inkFor('#1f2233')).toBe('#ffffff');
    for (const colour of [null, '', 'banana']) {
      const book = buildShelf([], [folder(1, 'x', colour)]).books[0];
      expect(book.colour).toBe('#4ade80');
      expect(book.ink).toBe('#11131c');
    }
  });

  it('finds the book a folder belongs to', () => {
    expect(bookIdOf(11, folders)).toBe(3);
    expect(bookIdOf(3, folders)).toBe(3);
    expect(bookIdOf(0, folders)).toBeNull();
    expect(bookIdOf(undefined, folders)).toBeNull();
    expect(bookIdOf(99, folders)).toBeNull();
  });

  it('lists a book\'s contents: the book, then its sections, pinned first, newest first', () => {
    const more = [...notes, note(40, 'Formeln', 3, { pinned: 1, updated_at: '2026-10-01 10:00:00' })];
    const sections = contentsOf(3, more, folders);
    expect(sections.map(s => [s.folder.name, s.depth])).toEqual([['Math', 0], ['Sub', 1]]);
    expect(sections[0].notes.map(n => n.id)).toEqual([40, 9, 8]);
    expect(sections[1].notes.map(n => n.id)).toEqual([13]);
  });

  it('knows the note edited last', () => {
    expect(latestNote(contentsOf(3, notes, folders))?.id).toBe(13);
    expect(latestNote(contentsOf(5, [], folders))).toBeNull();
  });

  it('survives folders that point at each other', () => {
    const loop = [folder(1, 'a', '#4ade80', 2), folder(2, 'b', '#4ade80', 1)];
    expect(bookIdOf(1, loop)).toBeNull();
    expect(buildShelf([note(1, 'n', 1)], loop).slips.length).toBe(1);
  });
});
