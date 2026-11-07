import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MailService } from '../../services/MailService';
import { MailDraft } from '../../model/models';

/** Writing a new email or a reply: plain text plus attachments. */
@Component({
  selector: 'app-compose',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './compose.html',
  styleUrl: './compose.css',
})
export class Compose {
  @Input({ required: true }) draft!: MailDraft;
  @Output() done = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();
  sending = false;
  error = '';

  constructor(private mail: MailService) {}

  async addFiles() {
    const files = await this.mail.pickAttachments();
    this.draft.attachments = [...(this.draft.attachments ?? []), ...files];
  }

  name(path: string) { return path.split('/').pop(); }

  removeFile(i: number) { this.draft.attachments!.splice(i, 1); }

  async send() {
    if (!this.draft.to.trim()) { this.error = 'Who is it for?'; return; }
    this.sending = true;
    this.error = '';
    const r = await this.mail.send(this.draft);
    this.sending = false;
    if (r.state === 'failed') {
      this.error = `Gmail didn't send it: ${r.error ?? 'unknown error'}`;     // the draft stays open to fix it
      return;
    }
    this.done.emit(r.state === 'sent' ? `Sent to ${this.draft.to}.`
      : 'In the Outbox: no connection to Gmail right now. It goes out as soon as there is one.');
  }
}
