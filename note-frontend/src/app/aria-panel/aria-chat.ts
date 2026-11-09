import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
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

/** The conversation with Aria. It lives here, not in the panel, so closing the panel (Esc, Ctrl+J) loses
 *  nothing: a reply that is still being written keeps arriving, and a yes/no question is still there with its
 *  buttons when the panel opens again. It lasts as long as the MyNotion window. */
@Injectable({ providedIn: 'root' })
export class AriaChat {
  messages: PanelMessage[] = [];
  draft = '';
  /** null until we know */
  running: boolean | null = null;
  starting = false;
  startError = '';
  /** fires whenever the messages changed (the panel scrolls down) */
  readonly changed = new Subject<void>();

  private sent: string[] = [];        // earlier messages, for ↑ / ↓
  private sentAt = 0;                 // where ↑ / ↓ is in them (sent.length = not browsing)
  private asking = false;             // between send and knowing the request's id
  private early: AriaEvent[] = [];    // events that arrived in that gap

  constructor(private zone: NgZone) {
    this.api?.onEvent?.(e => this.zone.run(() => this.onEvent(e)));
  }

  private get api() { return window.electronAPI?.aria; }
  get busy() { return this.asking || this.messages.some(m => m.pending); }

  async checkRunning() {
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
    this.changed.next();
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
    this.changed.next();
  }

  async startAria(): Promise<boolean> {
    if (this.starting) return false;
    this.starting = true;
    this.startError = '';
    let result: { ok: boolean; error?: 'no-launcher' | 'timeout' } | undefined;
    try { result = await this.api?.start?.(); } catch { result = undefined; }
    this.starting = false;
    this.running = !!result?.ok;
    if (!result?.ok) this.startError = START_ERRORS[result?.error ?? 'no-launcher'];
    return this.running;
  }

  /** ↑ / ↓ like a terminal, but only while the box is empty or still shows an earlier message untouched.
   *  Returns whether the key was used. */
  browse(up: boolean): boolean {
    const browsing = this.sentAt < this.sent.length && this.draft === this.sent[this.sentAt];
    if (this.draft && !browsing) return false;
    const to = this.sentAt + (up ? -1 : 1);
    if (to < 0 || to > this.sent.length) return false;
    this.sentAt = to;
    this.draft = this.sent[to] ?? '';
    return true;
  }
}
