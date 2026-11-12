import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { Folder, Note } from '../../model/models';
import { MailService } from '../../services/MailService';
import { NoteService } from '../../services/NoteService';
import { ModelService } from '../model.service';
import { TopBar } from './top-bar';

describe('Top bar', () => {
  let fixture: ComponentFixture<TopBar>;
  let model: ModelService;
  let status$: BehaviorSubject<any>;
  let flushed: number;

  const math: Folder = { id: 3, name: 'Math', colour: '#4ade80', parentID: null, userID: 1 };
  const sub: Folder = { id: 11, name: 'Sub', colour: '#4ade80', parentID: 3, userID: 1 };
  const german: Folder = { id: 5, name: 'German', colour: '#ef4444', parentID: null, userID: 1 };
  const loose: Note = { id: 1, title: 'sada', content: '', categoryID: 0, folderID: 0 };
  const el = () => fixture.nativeElement as HTMLElement;
  const button = (sel: string) => el().querySelector<HTMLButtonElement>(sel);
  const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  const view = async () => (await firstValueFrom(model.workspace$)).view;
  const current = () => firstValueFrom(model.currentNote$);
  const escape = (target: EventTarget = document.body) => {
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };

  beforeEach(async () => {
    status$ = new BehaviorSubject<any>({ unread: 0 });
    flushed = 0;
    await TestBed.configureTestingModule({
      imports: [TopBar],
      providers: [
        { provide: MailService, useValue: { status$ } },
        { provide: NoteService, useValue: { flushSaves: async () => { flushed++; }, getUserId: () => 1, addFolder: async () => ({}), notifyFolderChanged: () => {} } },
      ],
    }).compileComponents();
    model = TestBed.inject(ModelService);
    model.setFolders([math, sub, german]);
    fixture = TestBed.createComponent(TopBar);
    fixture.detectChanges();
  });

  it('goes to the inbox, the calendar and back to the shelf', async () => {
    button('.tb-inbox')!.click();
    expect(await view()).toBe('inbox');
    button('.tb-calendar')!.click();
    expect(await view()).toBe('calendar');
    button('.tb-home')!.click();
    await settle();
    expect(await view()).toBe('shelf');
  });

  it('shows how many emails are unread', () => {
    expect(el().querySelector('.menu-badge')).toBeNull();
    status$.next({ unread: 3 });
    fixture.detectChanges();
    expect(el().querySelector('.menu-badge')!.textContent).toBe('3');
  });

  it('has a way back only when a book or note is open, and saves before leaving', async () => {
    expect(button('.tb-back')).toBeNull();
    model.openBook(math, [11]);
    fixture.detectChanges();
    button('.tb-back')!.click();
    await settle();
    expect(flushed).toBe(1);
    expect(await view()).toBe('shelf');
  });

  it('a new note in an open book goes into that book', async () => {
    model.openBook(math, [11]);
    fixture.detectChanges();
    button('.tb-new-note')!.click();
    fixture.detectChanges();
    expect(el().querySelector('.new-note-where')).toBeNull();
    expect((await current())?.folderID).toBe(3);
  });

  it('on the shelf it asks where the new note should go', async () => {
    button('.tb-new-note')!.click();
    fixture.detectChanges();
    const places = Array.from(el().querySelectorAll<HTMLButtonElement>('.new-note-where .where'));
    expect(places.map(p => p.textContent!.trim())).toEqual(['On the desk', 'Math', 'German']);     // sections aren't books
    places[2].click();
    fixture.detectChanges();
    expect((await current())?.folderID).toBe(5);
    expect(await view()).toBe('book');
    expect(el().querySelector('.new-note-where')).toBeNull();

    model.openHome();
    fixture.detectChanges();
    button('.tb-new-note')!.click();
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.where.desk')!.click();
    expect((await current())?.folderID).toBe(0);
    expect(await view()).toBe('slip');
  });

  it('New book opens the notebook dialog, Aria her panel', async () => {
    button('.tb-new-book')!.click();
    expect(await firstValueFrom(model.isOpenFolder$)).toBeTrue();
    expect(model.folderAdderParent).toBeNull();
    button('.tb-aria')!.click();
    expect(await firstValueFrom(model.ariaPanelOpen$)).toBeTrue();
  });

  it('Esc leaves the book, but not while typing or while a dialog is open', async () => {
    model.openBook(math, [11]);
    model.onNoteClicked({ id: 8, title: 'n', content: '', categoryID: 0, folderID: 3 });
    fixture.detectChanges();

    const field = document.createElement('input');
    const editor = document.createElement('app-editor');
    const inEditor = document.createElement('div');
    editor.appendChild(inEditor);
    document.body.append(field, editor);
    escape(field); escape(inEditor);
    await settle();
    expect(await view()).toBe('book');

    const dialog = document.createElement('div');
    dialog.className = 'qs-backdrop';
    document.body.appendChild(dialog);
    escape();
    await settle();
    expect(await view()).toBe('book');
    dialog.remove();

    escape();
    await settle();
    expect(flushed).toBe(1);
    expect(await view()).toBe('shelf');
    field.remove(); editor.remove();
  });

  it('Esc leaves a note from the desk too, and does nothing on the shelf', async () => {
    escape();
    await settle();
    expect(flushed).toBe(0);
    model.onNoteClicked(loose);
    fixture.detectChanges();
    escape();
    await settle();
    expect(await view()).toBe('shelf');
  });
});
