import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, combineLatest } from 'rxjs';
import { ModelService } from '../model.service';
import { AriaEvent } from '../../services/NoteService';

export type PanelMessage = {
  role: 'user' | 'aria';
  text: string;
  id?: string;               // the request this reply answers
  pending?: boolean;         // Aria is still writing it
  failed?: boolean;
  error?: string;            // why it failed
  confirm?: string | null;   // a yes/no question waiting for an answer
  question?: string;         // what was asked, for Retry
};

const START_ERRORS = {
  'no-launcher': 'Start Aria once from the menu, then try again.',
  'timeout': "Aria didn't start. Check ~/.cache/aria/aria.log.",
};

/** Talk to Aria without leaving MyNotion (Ctrl+J). She is the same Aria as the orb: same conversation, memory
 *  and tools; here she answers in writing instead of speaking. The connection is in note/src/aria.ts. */
@Component({
  selector: 'app-aria-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './aria-panel.html',
  styleUrls: ['./aria-panel.css'],
})
export class AriaPanel implements OnInit, AfterViewInit, OnDestroy {
  messages: PanelMessage[] = [];
  draft = '';
  /** null until we know */
  running: boolean | null = null;
  starting = false;
  startError = '';
  noteTitle: string | null = null;

  @ViewChild('list') private list?: ElementRef<HTMLElement>;
  @ViewChild('input') private input?: ElementRef<HTMLTextAreaElement>;

  private sent: string[] = [];        // earlier messages, for ↑ / ↓
  private sentAt = 0;                 // where ↑ / ↓ is in them (sent.length = not browsing)
  private asking = false;             // between send and knowing the request's id
  private early: AriaEvent[] = [];    // events that arrived in that gap
  private stopEvents?: () => void;
  private noteSub?: Subscription;

  constructor(private modelService: ModelService, private zone: NgZone) {}

  private get api() { return window.electronAPI?.aria; }
  get busy() { return this.asking || this.messages.some(m => m.pending); }

  ngOnInit() {
    this.stopEvents = this.api?.onEvent?.(e => this.zone.run(() => this.onEvent(e)));
    this.noteSub = combineLatest([this.modelService.currentNote$, this.modelService.isExistingNoteOpen$])
      .subscribe(([note, open]) => this.noteTitle = open && note ? (note.title?.trim() || 'Untitled note') : null);
    void this.checkRunning();
  }

  ngAfterViewInit() {
    this.input?.nativeElement.focus();
  }

  ngOnDestroy() {
    this.stopEvents?.();
    this.noteSub?.unsubscribe();
  }

  private async checkRunning() {
    try { this.running = (await this.api?.status?.()) === 'running'; }
    catch { this.running = false; }
  }

  async send() {
    const text = this.draft.trim();
    if (!text || this.busy) return;
    this.draft = '';
    if (await this.deliver(text)) {
      this.sent.push(text);
      this.sentAt = this.sent.length;
    } else if (!this.draft) {
      this.draft = text;              // nothing typed is lost
    }
  }

  /** Yes / No under a question. Sent as a normal message: Aria checks the answer herself, in code. */
  async answer(text: 'yes' | 'no') {
    if (this.busy) return;
    await this.deliver(text);
  }

  async retry(m: PanelMessage) {
    if (this.busy || !m.failed || !m.question) return;
    const at = this.messages.indexOf(m);
    if (at < 0) return;
    const from = at > 0 && this.messages[at - 1].role === 'user' ? at - 1 : at;
    this.messages.splice(from, at - from + 1);
    await this.deliver(m.question);
  }

  private async deliver(text: string): Promise<boolean> {
    this.messages.forEach(m => m.confirm = null);         // an older question is answered or dropped by this
    const reply: PanelMessage = { role: 'aria', text: '', pending: true, question: text };
    this.messages.push({ role: 'user', text }, reply);
    this.scrollDown();
    this.asking = true;
    this.early = [];
    let result: { ok: true; id: string } | { ok: false; error: 'not-running' } | undefined;
    try { result = await this.api?.ask?.(text); } catch { result = undefined; }
    this.asking = false;
    if (!result?.ok) {
      this.messages.splice(this.messages.indexOf(reply) - 1, 2);
      this.running = false;
      return false;
    }
    this.running = true;
    this.startError = '';
    reply.id = result.id;
    this.early.splice(0).forEach(e => this.onEvent(e));
    return true;
  }

  private onEvent(e: AriaEvent) {
    if (!e || typeof e.id !== 'string') return;
    const m = this.messages.find(x => x.id === e.id && x.pending);
    if (!m) {
      if (this.asking) this.early.push(e);
      return;
    }
    if (e.type === 'text') {
      m.text += e.delta;
    } else if (e.type === 'done') {
      m.text = e.reply || m.text;     // her final wording replaces the draft that was streamed
      m.pending = false;
      m.confirm = e.confirm;
    } else if (e.type === 'error') {
      m.pending = false;
      m.failed = true;
      m.error = e.message;
    }
    this.scrollDown();
  }

  async startAria() {
    if (this.starting) return;
    this.starting = true;
    this.startError = '';
    let result: { ok: boolean; error?: 'no-launcher' | 'timeout' } | undefined;
    try { result = await this.api?.start?.(); } catch { result = undefined; }
    this.starting = false;
    this.running = !!result?.ok;
    if (!result?.ok) this.startError = START_ERRORS[result?.error ?? 'no-launcher'];
    else setTimeout(() => this.input?.nativeElement.focus());
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void this.send();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // like a terminal, but only while the box is empty or still shows an earlier message untouched
      const browsing = this.sentAt < this.sent.length && this.draft === this.sent[this.sentAt];
      if (this.draft && !browsing) return;
      const to = this.sentAt + (e.key === 'ArrowUp' ? -1 : 1);
      if (to < 0 || to > this.sent.length) return;
      e.preventDefault();
      this.sentAt = to;
      this.draft = this.sent[to] ?? '';
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
