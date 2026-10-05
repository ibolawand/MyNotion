import { Component, OnDestroy, OnInit } from '@angular/core';
import { ModelService } from '../model.service';
import { Adder } from '../adder/adder';
import { NoteService } from '../../services/NoteService';
import { Category, Folder, Note } from '../../model/models';
import { BehaviorSubject, Subscription } from 'rxjs';
import { OverviewPanel } from '../overview-panel/overview-panel';
import { AsyncPipe } from '@angular/common';
import { Editor } from '../editor/editor';
import { SideBar } from '../side-bar/side-bar';
import { Calendar } from '../calendar/calendar';
import { StartingPage } from '../starting-page/starting-page';
import { CreateAccount } from '../creat-account/creat-account';
import { WindowBar } from '../window-bar/window-bar';

@Component({
  selector: 'app-home-app',
  standalone: true,
  imports: [
    Adder,
    OverviewPanel,
    Editor,
    AsyncPipe,
    SideBar,
    Calendar,
    StartingPage,
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


  constructor(public modelService: ModelService, private noteService: NoteService) {
  }

  ngOnDestroy(): void {
    this.notesSub?.unsubscribe();
  }
  async ngOnInit() {
    await this.noteService.loadNotes();
    this.noteService.categories$.subscribe(list => this.categories = list);
    this.notesSub = this.noteService.notes$.subscribe(list => this.notes = list);

    if (this.modelService.isLoggedIn.value) {
      this.modelService.openDashboard();
    }
  }
  protected readonly console = console;
}
