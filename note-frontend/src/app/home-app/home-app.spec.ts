import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, firstValueFrom } from 'rxjs';
import { Folder, Note } from '../../model/models';
import { MailService } from '../../services/MailService';
import { NoteService } from '../../services/NoteService';
import { ModelService } from '../model.service';
import { HomeApp } from './home-app';
import { SHELF_SCENE } from '../bookshelf/bookshelf';
import { Editor } from '../editor/editor';
import { Calendar } from '../calendar/calendar';
import { Inbox } from '../inbox/inbox';
import { AriaPanel } from '../aria-panel/aria-panel';
import { QuickSearch } from '../quick-search/quick-search';
import { UndoBar } from '../undo-bar/undo-bar';
import { WindowBar } from '../window-bar/window-bar';
import { CreateAccount } from '../creat-account/creat-account';
import { OpenBook } from '../open-book/open-book';

@Component({ selector: 'app-editor', standalone: true, template: 'editor' }) class StubEditor {}
@Component({ selector: 'app-calendar', standalone: true, template: 'calendar' }) class StubCalendar {}
@Component({ selector: 'app-inbox', standalone: true, template: 'inbox' }) class StubInbox {}
@Component({ selector: 'app-aria-panel', standalone: true, template: '' }) class StubAria {}
@Component({ selector: 'app-quick-search', standalone: true, template: '' }) class StubSearch {}
@Component({ selector: 'app-undo-bar', standalone: true, template: '' }) class StubUndo {}
@Component({ selector: 'app-window-bar', standalone: true, template: '' }) class StubWindow {}
@Component({ selector: 'app-create-account', standalone: true, template: '' }) class StubAccount {}

/** The home screen is the shelf, and every way in (Aria's "open note 13", the calendar, the inbox) lands in the
 *  right place. */
describe('Home screen', () => {
  let fixture: ComponentFixture<HomeApp>;
  let model: ModelService;
  let notes$: BehaviorSubject<Note[]>;
  let sendTarget: (t: string) => void;
  let before: unknown;

  const math: Folder = { id: 3, name: 'Math', colour: '#4ade80', parentID: null, userID: 1 };
  const sub: Folder = { id: 11, name: 'Sub', colour: '#4ade80', parentID: 3, userID: 1 };
  const folders = [math, sub];
  const note = (id: number, title: string, folderID: number, content = ''): Note => ({ id, title, content, categoryID: 0, folderID });
  const list = () => [note(8, 'Schularbeiten', 3), note(13, 'Differentialgleichung', 11), note(5, 'Shopping list', 0), note(1, 'sada', 0)];
  const el = () => fixture.nativeElement as HTMLElement;
  const has = (sel: string) => !!el().querySelector(sel);
  const settle = async () => { for (let i = 0; i < 4; i++) { await fixture.whenStable(); fixture.detectChanges(); } };
  const current = () => firstValueFrom(model.currentNote$);

  beforeEach(async () => {
    notes$ = new BehaviorSubject<Note[]>(list());
    before = (window as any).electronAPI;
    (window as any).electronAPI = {
      onOpenTarget: (fn: (t: string) => void) => { sendTarget = fn; return () => {}; },
      takeOpenTarget: async () => null,
    };
    const noteService = {
      notes$, categories$: new BehaviorSubject([]), folderChanged$: new Subject<void>(),
      loadNotes: async () => {}, loadFolders: async () => folders, loadCategories: async () => {},
      getNotesCache: () => notes$.value, flushSaves: async () => {}, getUserId: () => 1,
    };
    TestBed.configureTestingModule({
      imports: [HomeApp],
      providers: [
        { provide: NoteService, useValue: noteService },
        { provide: MailService, useValue: { status$: new BehaviorSubject({ unread: 0 }) } },
        { provide: SHELF_SCENE, useValue: null },
      ],
    });
    TestBed.overrideComponent(HomeApp, {
      remove: { imports: [Editor, Calendar, Inbox, AriaPanel, QuickSearch, UndoBar, WindowBar, CreateAccount] },
      add: { imports: [StubEditor, StubCalendar, StubInbox, StubAria, StubSearch, StubUndo, StubWindow, StubAccount] },
    });
    TestBed.overrideComponent(OpenBook, { remove: { imports: [Editor] }, add: { imports: [StubEditor] } });
    await TestBed.compileComponents();
    model = TestBed.inject(ModelService);
    model.isLoggedIn.next(true);
    fixture = TestBed.createComponent(HomeApp);
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => { (window as any).electronAPI = before; });

  it('starts on the shelf, with the bar on top and no sidebar', () => {
    expect(has('app-bookshelf')).toBeTrue();
    expect(has('app-top-bar')).toBeTrue();
    expect(has('app-open-book')).toBeFalse();
    expect(el().querySelectorAll('app-bookshelf .book').length).toBe(1);
  });

  it('"open note 13" opens its book on that note', async () => {
    sendTarget('note:13');
    await settle();
    expect(has('app-open-book')).toBeTrue();
    expect(has('app-bookshelf')).toBeFalse();
    expect((await current())?.id).toBe(13);
    expect(el().querySelector('.contents-note.active .note-title')!.textContent).toBe('Differentialgleichung');
    expect(el().querySelector<HTMLInputElement>('.book-title')!.value).toBe('Math');
  });

  it('a note without a notebook opens on its own', async () => {
    sendTarget('note:5');
    await settle();
    expect(has('app-open-book')).toBeFalse();
    expect(has('.workspace > app-editor')).toBeTrue();
    expect((await current())?.id).toBe(5);
  });

  it('calendar and inbox still open, and Shelf goes home', async () => {
    sendTarget('calendar');
    await settle();
    expect(has('app-calendar')).toBeTrue();
    sendTarget('inbox');
    await settle();
    expect(has('app-inbox')).toBeTrue();
    el().querySelector<HTMLButtonElement>('.tb-home')!.click();
    await settle();
    expect(has('app-bookshelf')).toBeTrue();
  });

  it('a click on a book opens it, on a slip opens the note', async () => {
    el().querySelector<HTMLButtonElement>('app-bookshelf .book')!.click();
    await settle();
    expect(has('app-open-book')).toBeTrue();
    expect((await current())?.id).toBeDefined();
    el().querySelector<HTMLButtonElement>('.tb-back')!.click();
    await settle();
    el().querySelector<HTMLButtonElement>('app-bookshelf .desk > .slip')!.click();
    await settle();
    expect(has('.workspace > app-editor')).toBeTrue();
    expect((await current())?.id).toBe(1);
  });

  it('a change from outside leaves the open book and note alone', async () => {
    sendTarget('note:13');
    await settle();
    notes$.next([...list(), note(41, 'Von Aria', 0)]);
    await settle();
    expect(has('app-open-book')).toBeTrue();
    expect((await current())?.id).toBe(13);
  });

  it('a new note that is not saved yet stays open when the database reloads', async () => {
    model.newNoteIn(null);
    await settle();
    const fresh = await current();
    fresh!.content = '<p>typed</p>';
    notes$.next([...list(), note(41, 'Von Aria', 3)]);
    await settle();
    expect(has('.workspace > app-editor')).toBeTrue();
    expect(await current()).toBe(fresh);
    expect((await current())?.content).toBe('<p>typed</p>');
  });
});
