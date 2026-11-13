import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, combineLatest } from 'rxjs';
import { ModelService } from '../model.service';
import { AriaChat, PanelMessage } from './aria-chat';
import { Notebook, StudyAction, TestCard } from '../../services/NoteService';

export type { PanelMessage } from './aria-chat';

/** Talk to Aria without leaving MyNotion (Ctrl+J). She is the same Aria as the orb: same conversation, memory
 *  and tools; here she answers in writing instead of speaking. The conversation itself is kept in AriaChat (it
 *  survives closing the panel); the connection is in note/src/aria.ts. */
@Component({
  selector: 'app-aria-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './aria-panel.html',
  styleUrls: ['./aria-panel.css'],
})
export class AriaPanel implements OnInit, AfterViewInit, OnDestroy {
  noteTitle: string | null = null;

  @ViewChild('list') private list?: ElementRef<HTMLElement>;
  @ViewChild('input') private input?: ElementRef<HTMLTextAreaElement>;
  private subs = new Subscription();

  constructor(private modelService: ModelService, private chat: AriaChat) {}

  get messages(): PanelMessage[] { return this.chat.messages; }
  get draft() { return this.chat.draft; }
  set draft(value: string) { this.chat.draft = value; }
  get running() { return this.chat.running; }
  set running(value: boolean | null) { this.chat.running = value; }
  get starting() { return this.chat.starting; }
  get startError() { return this.chat.startError; }
  get busy() { return this.chat.busy; }
  get quizActive() { return this.chat.quizActive; }
  get tests() { return this.chat.tests; }
  get notebooks() { return this.chat.notebooks; }

  ngOnInit() {
    this.subs.add(combineLatest([this.modelService.currentNote$, this.modelService.isExistingNoteOpen$])
      .subscribe(([note, open]) => this.noteTitle = open && note ? (note.title?.trim() || 'Untitled note') : null));
    this.subs.add(this.chat.changed.subscribe(() => this.scrollDown()));
    void this.chat.checkRunning().then(() => this.chat.loadTests());
  }

  ngAfterViewInit() {
    this.input?.nativeElement.focus();
    this.scrollDown();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  send() { return this.chat.send(); }
  answer(text: 'yes' | 'no') { return this.chat.answer(text); }
  retry(m: PanelMessage) { return this.chat.retry(m); }
  study(action: StudyAction) { return this.chat.study(action); }
  studyTest(card: TestCard) { return this.chat.studyTest(card); }
  mapTest(subject: string, notebook: string) { return notebook ? this.chat.mapTest(subject, +notebook) : undefined; }
  /** "Normalformen · Databases · 3 notes", or why there is no Quiz me */
  detail(card: TestCard): string {
    const nb = card.notebook;
    if (!nb) return this.notebooks.length ? '' : 'Make a notebook for it first.';
    if (card.notes === 0) return `${nb.name} · no notes with enough text yet`;
    const notes = card.notes === 1 ? '1 note' : `${card.notes} notes`;
    return [card.topic, nb.name, notes].filter(Boolean).join(' · ');
  }
  quizButton(word: 'hint' | 'skip' | 'stop') { return this.chat.quizButton(word); }

  async startAria() {
    if (await this.chat.startAria()) {
      void this.chat.loadTests();
      setTimeout(() => this.input?.nativeElement.focus());
    }
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void this.send();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (this.chat.browse(e.key === 'ArrowUp')) e.preventDefault();
    }
  }

  close() {
    this.modelService.closeAriaPanel();
  }

  private scrollDown() {
    setTimeout(() => {
      const el = this.list?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
