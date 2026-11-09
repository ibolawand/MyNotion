import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { AsyncPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MailService } from '../../services/MailService';
import { NoteService } from '../../services/NoteService';
import { ModelService } from '../model.service';
import { MailDraft, MailMessage, MailSummary } from '../../model/models';
import { avatarHue, htmlToPlain, initials } from './mail-html';
import { dueTag } from '../text-editor/due-dates';
import { Compose } from './compose';
import { MailSetup } from './mail-setup';
import { MailReader } from './mail-reader';

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The Inbox: list on the left (Inbox / Filtered, search), the open email or the writing box on the right. */
@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [AsyncPipe, DatePipe, FormsModule, Compose, MailSetup, MailReader],
  templateUrl: './inbox.html',
  styleUrl: './inbox.css',
})
export class Inbox implements OnInit, OnDestroy {
  open: MailMessage | null = null;
  draft: MailDraft | null = null;
  notice = '';
  eventForm: { title: string; date: string; time: string } | null = null;
  query = '';
  private sub?: Subscription;
  @ViewChild('search') searchBox?: ElementRef<HTMLInputElement>;

  constructor(public mail: MailService, private notes: NoteService, private model: ModelService,
              ) {}

  ngOnInit() {
    void this.mail.reload();
    this.sub = this.model.inboxTarget.subscribe(id => { if (id != null) void this.select(id); });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  isToday(iso: string) { return new Date(iso).toDateString() === new Date().toDateString(); }

  async select(id: number) {
    this.draft = null;
    this.eventForm = null;
    this.notice = '';
    this.open = await this.mail.get(id);
    void this.mail.reload();          // the unread dot goes away
  }

  compose() { this.open = null; this.draft = { to: '', subject: '', body: '' }; }

  reply() {
    const m = this.open!;
    const text = m.body_text || htmlToPlain(m.body_html);
    const quoted = text.trim().split('\n').map(l => '> ' + l).join('\n');
    const when = new Date(m.date).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
    this.draft = { to: m.reply_to || m.from_addr,   // "Reply-To" wins (class lists, ticket systems)
                   subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
                   body: `\n\nOn ${when}, ${m.from_name} wrote:\n${quoted}`, inReplyToId: m.id };
  }

  async sent(text: string) {
    this.draft = null;
    this.notice = text;
  }

  async archive() {
    if (!this.open) return;
    await this.mail.archive(this.open.id);
    this.open = null;
    this.notice = 'Archived. It stays in Gmail under All Mail.';
  }

  async notJunk() {
    if (!this.open) return;
    await this.mail.notJunk(this.open.id);
    this.notice = `${this.open.from_name} will always show in the Inbox now.`;
  }

  /** "Answer Mr Huber · due Sun 8 Nov" on the To-do list (the same format Aria and the due chips use). */
  async remindMe() {
    const m = this.open!;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const text = `Answer ${m.from_name} about ${m.subject} · ${dueTag(tomorrow)}`;
    const li = `<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label>` +
               `<div><p>${escapeHtml(text)}</p></div></li>`;
    await this.notes.loadNotes();
    const todo = this.notes.getNotesCache().find(n => /^to-?do( list)?$/i.test(n.title.trim()));
    if (todo) {
      const content = todo.content || '';
      const updated = /<\/ul>\s*$/.test(content) && content.includes('data-type="taskList"')
        ? content.replace(/<\/ul>\s*$/, li + '</ul>') : content + `<ul data-type="taskList">${li}</ul>`;
      await this.notes.updateNote({ ...todo, content: updated });
    } else {
      await this.notes.createNote({ title: 'To-do', content: `<ul data-type="taskList">${li}</ul>`, categoryID: 0, folderID: 0 });
    }
    this.notice = `Added "${text}" to your To-do list.`;
  }

  startEvent() {
    const d = new Date();
    const p = (n: number) => (n < 10 ? '0' : '') + n;
    this.eventForm = { title: this.open!.subject, date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: '' };
  }

  async saveEvent() {
    const f = this.eventForm!;
    const [h, mi] = f.time ? f.time.split(':').map(Number) : [0, 0];
    const res = await this.notes.createEvent({
      date: f.date, title: f.title, allDay: !f.time, startHour: f.time ? h + mi / 60 : null,
      duration: f.time ? 1 : null, color: f.time ? 'blue' : null, userID: this.notes.getUserId(),
    } as any);
    this.notice = res?.ok ? `Added "${f.title}" to your calendar.` : "Couldn't save the event.";
    this.eventForm = null;
  }

  async openAttachment(id: number) {
    const r = await this.mail.openAttachment(id);
    if (r && !r.ok) this.notice = r.error ?? "Couldn't open it.";
  }

  initials = initials;
  hue = avatarHue;

  trackId(_: number, m: MailSummary) { return m.id; }
}
