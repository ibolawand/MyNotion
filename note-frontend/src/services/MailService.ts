import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MailDraft, MailMessage, MailSendResult, MailStatus, MailSummary } from '../model/models';

/** The Inbox's data: list + status from the main process, reloaded whenever the database changes (sync, Aria). */
@Injectable({ providedIn: 'root' })
export class MailService {
  readonly status$ = new BehaviorSubject<MailStatus>({ configured: false, online: true, unread: 0 });
  readonly messages$ = new BehaviorSubject<MailSummary[]>([]);
  view: 'inbox' | 'filtered' = 'inbox';
  query = '';

  constructor(private zone: NgZone) {
    window.electronAPI?.onDbChanged?.(() => this.zone.run(() => void this.reload()));
    void this.reload();
  }

  private get api() { return window.electronAPI?.mail; }

  async reload() {
    if (!this.api) return;
    const status = await this.api.status();
    this.status$.next(status);
    this.messages$.next(status.configured ? await this.api.list({ view: this.view, query: this.query }) : []);
  }

  async setView(view: 'inbox' | 'filtered') { this.view = view; await this.reload(); }
  async search(query: string) { this.query = query; await this.reload(); }
  async refresh() { await this.api?.refresh(); await this.reload(); }
  async setup(address: string, password: string) {
    const r = await this.api!.setup(address, password);
    await this.reload();
    return r;
  }
  async forget() { await this.api?.forget(); await this.reload(); }
  get(id: number): Promise<MailMessage | null> { return this.api ? this.api.get(id) : Promise.resolve(null); }
  async archive(id: number) { await this.api?.archive(id); await this.reload(); }
  async markUnread(id: number) { await this.api?.markRead(id, false); await this.reload(); }
  async notJunk(id: number) { await this.api?.notJunk(id); await this.reload(); }
  async send(d: MailDraft): Promise<MailSendResult> { const r = await this.api!.send(d); await this.reload(); return r; }
  async retry(clientId: string) { this.status$.next(await this.api!.retry(clientId)); await this.reload(); }
  async discard(clientId: string) { this.status$.next(await this.api!.discard(clientId)); await this.reload(); }
  pickAttachments(): Promise<string[]> { return this.api ? this.api.pickAttachments() : Promise.resolve([]); }
  openAttachment(id: number) { return this.api?.openAttachment(id); }
}
