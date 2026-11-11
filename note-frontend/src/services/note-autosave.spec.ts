import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { NoteService } from './NoteService';
import { Note } from '../model/models';

/** Typing must never be lost: not to a reload from the database, not to a save of another note. */
describe('Note autosave', () => {
  let service: NoteService;
  let db: Map<number, Note>;
  let written: Note[];
  let before: unknown;

  const note = (id: number, content: string): Note => ({ id, userID: 1, title: `n${id}`, content } as Note);

  beforeEach(() => {
    db = new Map([[1, note(1, '<p>old</p>')], [2, note(2, '<p>other</p>')]]);
    written = [];
    before = (window as any).electronAPI;
    (window as any).electronAPI = {
      notes: {
        getAllNotes: async () => [...db.values()].map(n => ({ ...n })),
        updateNote: async (n: Note) => { written.push({ ...n }); db.set(n.id!, { ...n }); return { ok: true }; },
        createNote: async (n: Note) => { written.push({ ...n }); return { ok: true, id: 99 }; },
      },
    };
    localStorage.setItem('userId', '1');
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(NoteService);
  });

  afterEach(() => { (window as any).electronAPI = before; });

  const contentOf = (id: number) => service.getNotesCache().find(n => n.id === id)?.content;

  it('a reload from the database keeps typing that is not saved yet', fakeAsync(() => {
    service.loadNotes(); flushMicrotasks();
    const a = { ...contentOfNote(1) , content: '<p>old</p><p></p><p></p>' };
    service.triggerAutoSave(a);
    service.loadNotes(); flushMicrotasks();          // e.g. switching notes woke the database watcher
    expect(contentOf(1)).toBe('<p>old</p><p></p><p></p>');
    tick(1000); flushMicrotasks();
    expect(db.get(1)!.content).toBe('<p>old</p><p></p><p></p>');
  }));

  it('editing another note does not cancel the first one\'s save', fakeAsync(() => {
    service.loadNotes(); flushMicrotasks();
    service.triggerAutoSave({ ...contentOfNote(1), content: '<p>A new</p>' });
    tick(200);
    service.triggerAutoSave({ ...contentOfNote(2), content: '<p>B new</p>' });
    tick(1000); flushMicrotasks();
    expect(db.get(1)!.content).toBe('<p>A new</p>');
    expect(db.get(2)!.content).toBe('<p>B new</p>');
  }));

  it('flushSaves writes waiting changes at once', fakeAsync(() => {
    service.loadNotes(); flushMicrotasks();
    service.triggerAutoSave({ ...contentOfNote(1), content: '<p>now</p>' });
    service.flushSaves(); flushMicrotasks();
    expect(db.get(1)!.content).toBe('<p>now</p>');
    tick(1000); flushMicrotasks();
    expect(written.length).toBe(1);                  // not saved a second time by the timer
  }));

  function contentOfNote(id: number): Note {
    return { ...service.getNotesCache().find(n => n.id === id)! };
  }
});
