import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject, combineLatest } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { Folder, Note } from '../model/models';
import { bookIdOf } from './shelf/shelf-model';

/** What fills the workspace under the top bar: the shelf (home), an opened book, a single note from the desk,
 *  the calendar or the inbox. */
export type Workspace = { view: 'shelf' } | { view: 'book'; folderId: number } | { view: 'slip' }
  | { view: 'calendar' } | { view: 'inbox' };

@Injectable({ providedIn: 'root' })
export class ModelService {
  isOpen = new BehaviorSubject(false);
  private isSublistOpen = new BehaviorSubject(false);
  isExistingNoteOpen = new BehaviorSubject(false);
  openCalendar = new BehaviorSubject(false);
  openOverview = new BehaviorSubject(false);
  openInbox = new BehaviorSubject(false);
  openInbox$ = this.openInbox.asObservable();
  /** the email to show when the Inbox opens (Aria's --open=mail:<id>) */
  inboxTarget = new BehaviorSubject<number | null>(null);
  isStartingPageOpen = new BehaviorSubject(true);
  isLoggedIn = new BehaviorSubject(false);
  isAllNotesFolderOpen = new BehaviorSubject(false);


  isOpen$ = this.isOpen.asObservable();
  isSublistOpen$ = this.isSublistOpen.asObservable();
  noteClicked: Subject<Note> = new Subject<Note>();
  noteClicked$ = this.noteClicked.asObservable();
  isExistingNoteOpen$ = this.isExistingNoteOpen.asObservable();
  openCalendar$ = this.openCalendar.asObservable();
  openOverview$ = this.openOverview.asObservable();
  isStartingPageOpen$ = this.isStartingPageOpen.asObservable();
  isAllNotesFolderOpen$ = this.isAllNotesFolderOpen.asObservable();

  // current selected/edited note observable
  private currentNoteSubject: BehaviorSubject<Note | null> = new BehaviorSubject<Note | null>(null);
  public currentNote$ = this.currentNoteSubject.asObservable();
  private openDashboardSubject = new BehaviorSubject<boolean>(false);
  public readonly openDashboard$ = this.openDashboardSubject.asObservable();

  //selected/edited folder observable
  private currentFolderSubject: BehaviorSubject<Folder | null> = new BehaviorSubject<Folder | null>(null);
  public currentFolder$ = this.currentFolderSubject.asObservable();
  currentFolderIds = new BehaviorSubject<number[]>([]);
  public currentFolderIds$ = this.currentFolderIds.asObservable();



  /** The book (top-level folder) that lies open, or null. */
  private openBookSubject = new BehaviorSubject<number | null>(null);
  openBookId$ = this.openBookSubject.asObservable();

  /** Derived from the switches above, so every old way in (onNoteClicked, openHome, showCalendar…) still works. */
  workspace$ = combineLatest([this.openInbox, this.isExistingNoteOpen, this.openCalendar, this.openBookSubject]).pipe(
    map(([inbox, note, calendar, book]): Workspace =>
      inbox ? { view: 'inbox' }
        : note ? (book != null ? { view: 'book', folderId: book } : { view: 'slip' })
        : calendar ? { view: 'calendar' }
        : book != null ? { view: 'book', folderId: book } : { view: 'shelf' }),
    distinctUntilChanged((a, b) => a.view === b.view && (a as any).folderId === (b as any).folderId));

  /** The book that was open last: the shelf shows it closing and going back to its place, once. */
  lastBookId: number | null = null;

  /** Open a book from the shelf: it becomes the current folder, so a new note lands in it. */
  openBook(folder: Folder, descendantIds: number[] = []) {
    this.openInbox.next(false);
    this.openCalendar.next(false);
    this.isStartingPageOpen.next(false);
    this.setCurrentFolder(folder, descendantIds);
    this.lastBookId = folder.id;
    this.openBookSubject.next(folder.id);
  }

  /** Back to the shelf. */
  closeBook() { this.openHome(); }

  /** Open an existing note where it lives: inside its book, or as a slip from the desk. */
  openNote(note: Note, folders: Folder[]) {
    const bookId = bookIdOf(note.folderID, folders);
    const book = folders.find(f => f.id === bookId);
    if (book) this.openBook(book, descendantIds(book.id, folders));
    else this.openHome();
    this.onNoteClicked(note);
  }

  /** A blank note in this book, or on the desk (null). */
  newNoteIn(book: Folder | null, descendants: number[] = []) {
    if (book) this.openBook(book, descendants);
    else this.openHome();
    this.toggleOpenNewNote();
  }

  /** The Aria panel on the right (Ctrl+J): it sits next to whatever is open, so it has its own switch. */
  private ariaPanelOpen = new BehaviorSubject(false);
  ariaPanelOpen$ = this.ariaPanelOpen.asObservable();
  toggleAriaPanel() { this.ariaPanelOpen.next(!this.ariaPanelOpen.value); }
  closeAriaPanel() { this.ariaPanelOpen.next(false); }
  openAriaPanel() { this.ariaPanelOpen.next(true); }

  toggleLogin() {
    this.isLoggedIn.next(!this.isLoggedIn.value);
  }

  /** The Inbox replaces the notes list and the editor. */
  showInbox(mailId: number | null = null) {
    this.isStartingPageOpen.next(false);
    this.openOverview.next(false);
    this.openCalendar.next(false);
    this.isOpen.next(false);
    this.isExistingNoteOpen.next(false);
    this.inboxTarget.next(mailId);
    this.openBookSubject.next(null);
    this.openInbox.next(true);
  }

  toggleCalendar() {
    this.openInbox.next(false);
    this.openBookSubject.next(null);
    if (this.isStartingPageOpen.value) {
      this.isStartingPageOpen.next(false);
      this.openOverview.next(false);
      this.openCalendar.next(true);
    } else {
      this.openOverview.next(!this.openOverview.value);
      this.openCalendar.next(!this.openCalendar.value);
    }
    this.isExistingNoteOpen.next(false);
  }

  openHome() {
    this.openInbox.next(false);
    this.openBookSubject.next(null);
    this.setCurrentFolder(null, []);
    this.isStartingPageOpen.next(false);
    this.openOverview.next(true);
    this.openCalendar.next(false);
    this.isExistingNoteOpen.next(false);
  }

  /** Always shows the calendar (toggleCalendar flips it, which is wrong for "open the calendar"). */
  showCalendar() {
    this.openInbox.next(false);
    this.openBookSubject.next(null);
    this.isStartingPageOpen.next(false);
    this.openOverview.next(false);
    this.isOpen.next(false);
    this.isExistingNoteOpen.next(false);
    this.openCalendar.next(true);
  }
  openSublist() {
    this.isSublistOpen.next(true);
  }

  closeSublist() {
    this.isSublistOpen.next(false);
  }

  /** "New Note": a blank note straight in the real editor (the old new-note screen was a plain textarea whose
   *  formatting buttons did nothing). It's only saved once something is typed, so no empty notes pile up. */
  toggleOpenNewNote() {
    const folder = this.currentFolderSubject.value;
    this.openCalendar.next(false);
    this.onNoteClicked({ title: '', content: '', categoryID: 0, folderID: folder?.id ?? 0 });
  }

  onNoteClicked(note: Note) {
    this.openInbox.next(false);
    this.noteClicked.next(note);
    this.isExistingNoteOpen.next(true);
    this.currentNoteSubject.next(note);
    this.isOpen.next(false);
  }

  // update the current note (publish to subscribers)
  updateCurrentNote(note: Note) {
    this.currentNoteSubject.next(note);
  }

  //#region "notes"
  private isFolderAdderOpen: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  isOpenFolder$ = this.isFolderAdderOpen.asObservable();

  openAllNotesFolder() {
    this.isAllNotesFolderOpen.next(true);
  }
  
  closeAllNotesFolder() {
    this.isAllNotesFolderOpen.next(false);
  }

  getCurrentFolder() {
    return this.currentFolderSubject.value;
  }

  setCurrentFolder(folder: Folder | null, descendantIds: number[] = []) {
    this.currentFolderSubject.next(folder);
    if (folder) {
      this.currentFolderIds.next([folder.id, ...descendantIds]);
      this.isAllNotesFolderOpen.next(false);
    } else {
      this.currentFolderIds.next([]);
      this.isAllNotesFolderOpen.next(true);
    }
  }

  closeFolderAdder() {
    this.folderAdderParent = null;
    this.isFolderAdderOpen.next(false);
  }
  // ModelService
  folderAdderParent: number | null = null;
  openFolderAdder(parentID: number | null = null) {
    this.folderAdderParent = parentID;
    this.isFolderAdderOpen.next(true);
  }

  //endregion

  //#region "calendar"
  private isEventAdderOpen = new BehaviorSubject(false);
  isEventAdderOpen$ = this.isEventAdderOpen.asObservable();

  private selectedDate = new BehaviorSubject<Date | null>(null);
  selectedDate$ = this.selectedDate.asObservable();

  openEventAdder(date: Date) {
    this.selectedDate.next(date);
    this.isEventAdderOpen.next(true);
  }

  closeEventAdder() {
    this.isEventAdderOpen.next(false);
    this.selectedDate.next(null);
  }
  //endregion
  public openDashboard() {
    this.openDashboardSubject.next(true);
  }

  public closeDashboard() {
    this.openDashboardSubject.next(false);
  }


}

/** Every folder below this one. */
export function descendantIds(folderId: number, folders: Folder[]): number[] {
  const ids: number[] = [];
  const add = (parent: number) => {
    for (const f of folders) {
      if (f.parentID === parent && !ids.includes(f.id) && f.id !== folderId) { ids.push(f.id); add(f.id); }
    }
  };
  add(folderId);
  return ids;
}
