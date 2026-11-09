import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { Folder, Note } from '../model/models';

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



  /** The Aria panel on the right (Ctrl+J): it sits next to whatever is open, so it has its own switch. */
  private ariaPanelOpen = new BehaviorSubject(false);
  ariaPanelOpen$ = this.ariaPanelOpen.asObservable();
  toggleAriaPanel() { this.ariaPanelOpen.next(!this.ariaPanelOpen.value); }
  closeAriaPanel() { this.ariaPanelOpen.next(false); }

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
    this.openInbox.next(true);
  }

  toggleCalendar() {
    this.openInbox.next(false);
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
    this.isStartingPageOpen.next(false);
    this.openOverview.next(true);
    this.openCalendar.next(false);
    this.isExistingNoteOpen.next(false);
  }

  /** Always shows the calendar (toggleCalendar flips it, which is wrong for "open the calendar"). */
  showCalendar() {
    this.openInbox.next(false);
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

