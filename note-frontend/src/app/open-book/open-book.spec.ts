import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { Category, Folder, Note } from '../../model/models';
import { NoteService } from '../../services/NoteService';
import { ModelService } from '../model.service';
import { Editor } from '../editor/editor';
import { OpenBook } from './open-book';

@Component({ selector: 'app-editor', standalone: true, template: '<p class="stub-editor">editor</p>' })
class StubEditor {}

describe('Open book', () => {
  let fixture: ComponentFixture<OpenBook>;
  let model: ModelService;
  let notes$: BehaviorSubject<Note[]>;
  let folderChanged$: Subject<void>;
  let folders: Folder[];
  let calls: string[];
  let confirmed: boolean;

  const math: Folder = { id: 3, name: 'Math', colour: '#4ade80', parentID: null, userID: 1 };
  const sub: Folder = { id: 11, name: 'Sub', colour: '#4ade80', parentID: 3, userID: 1 };
  const german: Folder = { id: 5, name: 'German', colour: '#ef4444', parentID: null, userID: 1 };
  const note = (id: number, title: string, folderID: number, extra: any = {}): Note => ({ id, title, content: '', categoryID: 0, folderID, ...extra });
  const sample = () => [
    note(8, 'Schularbeiten', 3, { updated_at: '2026-11-01 10:00:00', categoryID: 1 }),
    note(9, 'Matrizen', 3, { updated_at: '2026-11-05 10:00:00', pinned: 1 }),
    note(13, 'Differentialgleichung', 11, { updated_at: '2026-11-10 10:00:00' }),
    note(20, 'Aufsatz', 5, { updated_at: '2026-11-11 10:00:00' }),
  ];
  const el = () => fixture.nativeElement as HTMLElement;
  const all = <T extends HTMLElement = HTMLElement>(sel: string) => Array.from(el().querySelectorAll<T>(sel));
  const settle = async () => { for (let i = 0; i < 3; i++) { await fixture.whenStable(); fixture.detectChanges(); } };
  const currentId = () => { let n: Note | null = null; model.currentNote$.subscribe(x => n = x).unsubscribe(); return (n as Note | null)?.id; };

  async function open(book: Folder | null, list: Note[] = sample(), before: (m: ModelService) => void = () => {}) {
    notes$ = new BehaviorSubject<Note[]>(list);
    folderChanged$ = new Subject<void>();
    calls = [];
    const noteService = {
      notes$, folderChanged$,
      categories$: new BehaviorSubject<Category[]>([{ id: 1, name: 'ExamPrepreation', userID: 1 }]),
      loadFolders: async () => folders,
      flushSaves: async () => { calls.push('flushSaves'); },
      updateFolder: async (f: Folder) => { calls.push(`updateFolder:${f.name}:${f.colour}`); return f; },
      deleteFolder: async (f: Folder) => { calls.push(`deleteFolder:${f.id}`); },
      deleteWithUndo: (n: Note) => { calls.push(`deleteNote:${n.id}`); notes$.next(notes$.value.filter(x => x.id !== n.id)); },
      notifyFolderChanged: () => {},
      loadNotes: async () => {},
      loadCategories: async () => {},
      addCategory: async (c: any) => { calls.push(`addCategory:${c.name}`); return { id: 9 }; },
      deleteCategory: async (id: number) => { calls.push(`deleteCategory:${id}`); },
      notifyCategoriesChanged: () => {},
      getUserId: () => 1,
    };
    TestBed.configureTestingModule({ imports: [OpenBook], providers: [{ provide: NoteService, useValue: noteService }] });
    TestBed.overrideComponent(OpenBook, { remove: { imports: [Editor] }, add: { imports: [StubEditor] } });
    await TestBed.compileComponents();
    model = TestBed.inject(ModelService);
    const close = model.closeBook.bind(model);
    spyOn(model, 'closeBook').and.callFake(() => { calls.push('closeBook'); close(); });
    if (book) model.openBook(book, book.id === 3 ? [11] : []);
    before(model);
    spyOn(window, 'confirm').and.callFake(() => confirmed);
    fixture = TestBed.createComponent(OpenBook);
    fixture.detectChanges();
    await settle();
  }

  beforeEach(() => { folders = [math, german, sub]; confirmed = true; });

  it('lists the notebook\'s notes, pinned first, with its sections', async () => {
    await open(math);
    expect(all('.contents-note .note-title').map(e => e.textContent)).toEqual(['Matrizen', 'Schularbeiten', 'Differentialgleichung']);
    expect(all('.section-title span').map(e => e.textContent)).toEqual(['Sub']);
    expect(all('.category-tag').map(e => e.textContent)).toEqual(['ExamPrepreation']);
    expect(el().querySelector<HTMLInputElement>('.book-title')!.value).toBe('Math');
  });

  it('opens on the note edited last, and a click picks another', async () => {
    await open(math);
    expect(currentId()).toBe(13);
    expect(el().querySelector('.stub-editor')).not.toBeNull();
    expect(el().querySelector('.contents-note.active .note-title')!.textContent).toBe('Differentialgleichung');
    all('.contents-note')[1].click();
    fixture.detectChanges();
    expect(currentId()).toBe(8);
    expect(el().querySelector('.contents-note.active .note-title')!.textContent).toBe('Schularbeiten');
  });

  it('keeps the note that was asked for (Aria: open note 8)', async () => {
    await open(math, sample(), m => m.onNoteClicked(sample()[0]));
    expect(currentId()).toBe(8);
  });

  it('an empty notebook says so and offers a new note', async () => {
    const empty: Folder = { id: 7, name: 'loal', colour: '#ec4899', parentID: null, userID: 1 };
    folders = [...folders, empty];
    await open(empty);
    expect(el().textContent).toContain('No note yet');
    expect(el().querySelector('.stub-editor')).toBeNull();
    const fresh = spyOn(model, 'toggleOpenNewNote').and.callThrough();
    el().querySelector<HTMLButtonElement>('.empty-book .new-note')!.click();
    fixture.detectChanges();
    expect(fresh).toHaveBeenCalled();
    expect(el().querySelector('.contents-note.new')).not.toBeNull();       // the unsaved note has its row
    expect(el().querySelector('.stub-editor')).not.toBeNull();
  });

  it('renames the notebook, but not to nothing', async () => {
    await open(math);
    const input = el().querySelector<HTMLInputElement>('.book-title')!;
    input.value = 'Maths'; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('blur'));
    await settle();
    expect(calls).toContain('updateFolder:Maths:#4ade80');
    calls.length = 0;
    input.value = '   '; input.dispatchEvent(new Event('input')); fixture.detectChanges(); input.dispatchEvent(new Event('blur'));
    await settle();
    expect(calls).toEqual([]);
    expect(input.value).toBe('Maths');
  });

  it('changes the colour from the menu', async () => {
    await open(math);
    el().querySelector<HTMLButtonElement>('.menu-btn')!.click();
    fixture.detectChanges();
    all<HTMLButtonElement>('.book-colour')[3].click();
    await settle();
    expect(calls).toContain('updateFolder:Math:#ef4444');
  });

  it('deleting the notebook asks first, saves what is typed, then goes back to the shelf', async () => {
    await open(math);
    el().querySelector<HTMLButtonElement>('.menu-btn')!.click();
    fixture.detectChanges();
    confirmed = false;
    el().querySelector<HTMLButtonElement>('.book-delete')!.click();
    await settle();
    expect(calls).toEqual([]);
    confirmed = true;
    el().querySelector<HTMLButtonElement>('.book-delete')!.click();
    await settle();
    expect(calls).toEqual(['flushSaves', 'deleteFolder:3', 'closeBook']);
  });

  it('a notebook deleted from outside closes without losing what is typed', async () => {
    await open(math);
    folders = [german];
    folderChanged$.next();
    await settle();
    expect(calls).toEqual(['flushSaves', 'closeBook']);
  });

  it('deleting the open note moves on to the next one', async () => {
    await open(math);
    all<HTMLButtonElement>('.contents-note.active .note-delete')[0].click();
    fixture.detectChanges();
    expect(calls).toContain('deleteNote:13');
    expect(currentId()).toBe(9);
    expect(all('.contents-note').length).toBe(2);
  });

  it('the contents can be folded away', async () => {
    await open(math);
    el().querySelector<HTMLButtonElement>('.fold')!.click();
    fixture.detectChanges();
    expect(el().querySelector('.contents')!.classList).toContain('collapsed');
    expect(el().querySelector('.contents-list')).toBeNull();
    expect(el().querySelector('.stub-editor')).not.toBeNull();
  });

  it('categories are added and deleted from the menu', async () => {
    await open(math);
    el().querySelector<HTMLButtonElement>('.menu-btn')!.click();
    await settle();
    const input = el().querySelector<HTMLInputElement>('.category-add input')!;
    input.value = 'Homework'; input.dispatchEvent(new Event('input'));
    el().querySelector<HTMLFormElement>('.category-add')!.dispatchEvent(new Event('submit'));
    await settle();
    expect(calls).toContain('addCategory:Homework');
    el().querySelector<HTMLButtonElement>('.category-row .icon-btn')!.click();
    await settle();
    expect(calls).toContain('deleteCategory:1');
  });

  it('follows notes that change outside while the open note stays', async () => {
    await open(math);
    all('.contents-note')[1].click();
    notes$.next([...sample(), note(41, 'Von Aria', 3, { updated_at: '2026-11-12 08:00:00' })]);
    fixture.detectChanges();
    expect(all('.contents-note').length).toBe(4);
    expect(currentId()).toBe(8);
  });
});
