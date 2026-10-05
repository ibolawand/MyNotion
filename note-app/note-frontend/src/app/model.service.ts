import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { Note } from '../model/models';

@Injectable({ providedIn: 'root' })
export class ModelService {
  isOpen = new BehaviorSubject(false);
  private isSublistOpen = new BehaviorSubject(false);
  isExistingNoteOpen = new BehaviorSubject(false);
  openCalendar = new BehaviorSubject(false);
  openOverview = new BehaviorSubject(false);
  isStartingPageOpen = new BehaviorSubject(true);
  isLoggedIn = new BehaviorSubject(false);


  isOpen$ = this.isOpen.asObservable();
  isSublistOpen$ = this.isSublistOpen.asObservable();
  noteClicked: Subject<Note> = new Subject<Note>();
  noteClicked$ = this.noteClicked.asObservable();
  isExistingNoteOpen$ = this.isExistingNoteOpen.asObservable();
  openCalendar$ = this.openCalendar.asObservable();
  openOverview$ = this.openOverview.asObservable();
  isStartingPageOpen$ = this.isStartingPageOpen.asObservable();

  // current selected/edited note observable
  private currentNoteSubject: BehaviorSubject<Note | null> = new BehaviorSubject<Note | null>(null);
  public currentNote$ = this.currentNoteSubject.asObservable();
  private openDashboardSubject = new BehaviorSubject<boolean>(false);
  public readonly openDashboard$ = this.openDashboardSubject.asObservable();
  toggleLogin() {
    this.isLoggedIn.next(!this.isLoggedIn.value);
  }

  toggleCalendar() {
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
    this.isStartingPageOpen.next(false);
    this.openOverview.next(true);
    this.openCalendar.next(false);
    this.isExistingNoteOpen.next(false);
  }
  openSublist() {
    this.isSublistOpen.next(true);
  }

  closeSublist() {
    this.isSublistOpen.next(false);
  }

  toggleOpenNewNote() {
    this.isOpen.next(!this.isOpen.value);
    this.isExistingNoteOpen.next(false);
  }

  onNoteClicked(note: Note) {
    this.noteClicked.next(note);
    this.isExistingNoteOpen.next(true);
    this.currentNoteSubject.next(note);
    console.log(this.isOpen$);
    console.log(this.isOpen.value);
    this.isOpen.next(false);
  }

  // update the current note (publish to subscribers)
  updateCurrentNote(note: Note) {
    this.currentNoteSubject.next(note);
  }

  //#region "notes"
  private isFolderAdderOpen: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  isOpenFolder$ = this.isFolderAdderOpen.asObservable();

  openFolderAdder() {
    this.isFolderAdderOpen.next(true);
  }

  closeFolderAdder() {
    this.isFolderAdderOpen.next(false);
  }

  //endregion

  //#region "event adder"
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

