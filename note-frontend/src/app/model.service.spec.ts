import { firstValueFrom } from 'rxjs';
import { Folder, Note } from '../model/models';
import { ModelService, Workspace } from './model.service';

describe('what the workspace shows', () => {
  let model: ModelService;
  const math: Folder = { id: 3, name: 'Math', colour: '#4ade80', parentID: null, userID: 1 };
  const sub: Folder = { id: 11, name: 'Sub', colour: '#4ade80', parentID: 3, userID: 1 };
  const folders = [math, sub];
  const note = (id: number, folderID: number): Note => ({ id, title: 'n' + id, content: '', categoryID: 0, folderID });
  const shown = (): Promise<Workspace> => firstValueFrom(model.workspace$);
  const current = () => firstValueFrom(model.currentNote$);

  beforeEach(() => { model = new ModelService(); });

  it('starts on the shelf', async () => {
    expect(await shown()).toEqual({ view: 'shelf' });
  });

  it('opens a book and keeps it open while its notes are edited', async () => {
    model.openBook(math, [11]);
    expect(await shown()).toEqual({ view: 'book', folderId: 3 });
    expect(model.getCurrentFolder()).toBe(math);
    model.onNoteClicked(note(8, 3));
    expect(await shown()).toEqual({ view: 'book', folderId: 3 });
  });

  it('a note without a book is a slip from the desk', async () => {
    model.onNoteClicked(note(1, 0));
    expect(await shown()).toEqual({ view: 'slip' });
  });

  it('calendar and inbox replace the book, and Home goes back to the shelf', async () => {
    model.openBook(math, []);
    model.onNoteClicked(note(8, 3));
    model.showCalendar();
    expect(await shown()).toEqual({ view: 'calendar' });
    model.openHome();
    expect(await shown()).toEqual({ view: 'shelf' });
    expect(model.getCurrentFolder()).toBeNull();
    model.openBook(math, []);
    model.showInbox();
    expect(await shown()).toEqual({ view: 'inbox' });
    model.toggleCalendar();
    expect(await shown()).toEqual({ view: 'calendar' });
  });

  it('closing a book puts it back on the shelf', async () => {
    model.openBook(math, []);
    model.onNoteClicked(note(8, 3));
    model.closeBook();
    expect(await shown()).toEqual({ view: 'shelf' });
    expect(model.isExistingNoteOpen.value).toBeFalse();
  });

  it('a new note started inside a book belongs to it', async () => {
    model.openBook(math, []);
    model.toggleOpenNewNote();
    expect((await current())?.folderID).toBe(3);
    expect(await shown()).toEqual({ view: 'book', folderId: 3 });
  });

  it('opens a note where it lives: in its book, or as a slip', async () => {
    model.openNote(note(13, 11), folders);
    expect(await shown()).toEqual({ view: 'book', folderId: 3 });
    expect((await current())?.id).toBe(13);
    expect(model.currentFolderIds.value).toEqual([3, 11]);
    model.openNote(note(30, 99), folders);              // its folder is gone
    expect(await shown()).toEqual({ view: 'slip' });
    expect((await current())?.id).toBe(30);
    model.showCalendar();
    model.openNote(note(1, 0), folders);
    expect(await shown()).toEqual({ view: 'slip' });
  });

  it('a new note can be started in a chosen book or on the desk', async () => {
    model.newNoteIn(math, [11]);
    expect((await current())?.folderID).toBe(3);
    expect(await shown()).toEqual({ view: 'book', folderId: 3 });
    model.newNoteIn(null);
    expect((await current())?.folderID).toBe(0);
    expect(await shown()).toEqual({ view: 'slip' });
  });
});
