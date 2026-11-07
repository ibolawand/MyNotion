import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { ModelService } from '../model.service';
import { NoteService } from '../../services/NoteService';
import { Category, Folder, Note } from '../../model/models';
import { BehaviorSubject, Subscription } from 'rxjs';
import { OverviewPanel } from '../overview-panel/overview-panel';
import { AsyncPipe } from '@angular/common';
import { Editor } from '../editor/editor';
import { SideBar } from '../side-bar/side-bar';
import { QuickSearch } from '../quick-search/quick-search';
import { UndoBar } from '../undo-bar/undo-bar';
import { Calendar } from '../calendar/calendar';
import { Inbox } from '../inbox/inbox';
import { CreateAccount } from '../creat-account/creat-account';
import { WindowBar } from '../window-bar/window-bar';

@Component({
  selector: 'app-home-app',
  standalone: true,
  imports: [
    Inbox,
    QuickSearch,
    UndoBar,
    OverviewPanel,
    Editor,
    AsyncPipe,
    SideBar,
    Calendar,
    CreateAccount,
    WindowBar,
  ],
  templateUrl: './home-app.html',
  styleUrls: ['./home-app.css']
})
export class HomeApp implements OnDestroy, OnInit {
  notes: Note[] = []
  categories: Category[] = []
  private notesSub?: Subscription;
  private categoriesSub?: Subscription;


  private stopOpenListener?: () => void;

  constructor(public modelService: ModelService, private noteService: NoteService, private zone: NgZone) {
  }

  ngOnDestroy(): void {
    this.notesSub?.unsubscribe();
    this.stopOpenListener?.();
  }
  async ngOnInit() {
    await this.noteService.loadNotes();
    this.noteService.categories$.subscribe(list => this.categories = list);
    this.notesSub = this.noteService.notes$.subscribe(list => this.notes = list);

    if (this.modelService.isLoggedIn.value) {
      this.modelService.openDashboard();
    }

    // "open calendar" / "open note 12" sent by Aria (or `MyNotion --open=...`)
    const api = window.electronAPI;
    this.stopOpenListener = api?.onOpenTarget?.(t => this.zone.run(() => this.openTarget(t)));
    const startTarget = await api?.takeOpenTarget?.();
    if (startTarget) this.openTarget(startTarget);
  }

  private async openTarget(target: string) {
    if (!this.modelService.isLoggedIn.value) return;   // the login screen comes first
    this.modelService.openDashboard();
    if (target === 'calendar') {
      this.modelService.showCalendar();
    } else if (target === 'inbox' || target.startsWith('mail:')) {
      this.modelService.showInbox(target.startsWith('mail:') ? Number(target.slice('mail:'.length)) : null);
    } else if (target.startsWith('note:')) {
      const id = Number(target.slice('note:'.length));
      await this.noteService.loadNotes();
      const note = this.noteService.getNotesCache().find(n => n.id === id);
      if (note) {
        this.modelService.openHome();
        this.modelService.onNoteClicked(note);
      }
    } else {
      this.modelService.openHome();
    }
  }
  protected readonly console = console;
}
