import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MailMessage } from '../../model/models';
import { avatarHue, initials, mailDocument, textToHtml } from './mail-html';

/** One open email: header with the sender, the actions, attachments, and the body. Plain-text mail is shown in the
 *  app's own style; HTML mail on a white sheet (it's designed for one) in a locked-down frame, as tall as its content. */
@Component({
  selector: 'app-mail-reader',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './mail-reader.html',
  styleUrl: './mail-reader.css',
})
export class MailReader implements OnChanges {
  @Input({ required: true }) mail!: MailMessage;
  @Output() reply = new EventEmitter<void>();
  @Output() archive = new EventEmitter<void>();
  @Output() remind = new EventEmitter<void>();
  @Output() makeEvent = new EventEmitter<void>();
  @Output() markUnread = new EventEmitter<void>();
  @Output() notJunk = new EventEmitter<void>();
  @Output() openAttachment = new EventEmitter<number>();

  showImages = false;
  doc: SafeHtml | null = null;
  text: SafeHtml | null = null;

  constructor(private sanitizer: DomSanitizer) {}

  ngOnChanges() {
    this.showImages = false;
    this.render();
  }

  get initials() { return initials(this.mail.from_name || this.mail.from_addr); }
  get hue() { return avatarHue(this.mail.from_addr); }
  get hasRemoteImages() {
    return !!this.mail.body_html && /<img[^>]+src\s*=\s*["']?(?:https?:)?\/\//i.test(this.mail.body_html);
  }

  render() {
    const m = this.mail;
    this.doc = m.body_html ? this.sanitizer.bypassSecurityTrustHtml(mailDocument(m.body_html, this.showImages)) : null;
    this.text = m.body_html ? null : this.sanitizer.bypassSecurityTrustHtml(textToHtml(m.body_text || ''));
  }

  loadImages() { this.showImages = true; this.render(); }

  /** The frame is as tall as the email, so the whole pane scrolls as one page. */
  fit(frame: HTMLIFrameElement) {
    const d = frame.contentDocument;
    if (d) frame.style.height = `${Math.max(120, d.documentElement.scrollHeight)}px`;
  }

  ext(name: string) { return (name.split('.').pop() || 'file').slice(0, 4).toUpperCase(); }

  size(bytes: number) { return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`; }
}
