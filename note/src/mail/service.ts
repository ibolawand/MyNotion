/**
 * Runs mail in the main process: sync every 2 minutes (and on refresh), flush the outbox (every 5 s while something
 * is queued, so Aria's 10 s undo window holds), and the actions (read, archive). A wrong password stops it until
 * setup is done again: retrying a bad password can get the Google account locked. Being offline doesn't.
 */
import type { Database } from 'sqlite';
import type { Account } from './account';
import { MailClient, syncInbox } from './sync';
import { flushOutbox, problemMail, Transport } from './send';
import { getState, setState } from './store';

export const SYNC_EVERY_MS = 2 * 60 * 1000;
export const OUTBOX_EVERY_MS = 5 * 1000;

export const ERR_PASSWORD = "Gmail didn't accept the password. Make a new app password at myaccount.google.com/apppasswords.";
export const ERR_IMAP_OFF = 'Turn on IMAP in Gmail settings (Forwarding and POP/IMAP).';

export interface ImapLike extends MailClient {
  messageFlagsAdd(range: number[], flags: string[], opts: { uid: true; useLabels?: boolean }): Promise<boolean>;
  messageFlagsRemove(range: number[], flags: string[], opts: { uid: true; useLabels?: boolean }): Promise<boolean>;
}

/** ImapFlow emits 'error' when the connection drops (wifi off, laptop asleep); unheard, that's an uncaught error in
 *  Electron's main process. The command that was running still fails and is handled where it was called. */
export function withErrorListener<T extends { on?: (ev: string, fn: (e: unknown) => void) => unknown }>(client: T): T {
  client.on?.('error', (e: unknown) => console.warn('[mail] connection error:', (e as Error)?.message ?? e));
  return client;
}

/** The current uid of a mail, found by its Gmail id: a stored uid can be stale after Gmail renumbers the inbox. */
async function uidFor(c: ImapLike, gmMsgId: string): Promise<number | null> {
  const r = await c.search({ emailId: gmMsgId }, { uid: true });
  return Array.isArray(r) && r.length ? r[0] : null;
}

export interface MailDeps {
  db: () => Promise<Database>;
  loadAccount: (address: string) => Account | null;
  saveAccount: (address: string, password: string) => void;
  forgetAccount: (address: string) => void;
  makeImap: (a: Account) => ImapLike;
  makeTransport: (a: Account) => Transport;
  notify: () => void;                          // tell the window something changed (db-changed)
}

export type Problem = 'password' | 'imap-off' | 'offline' | 'other';

export function classify(e: any): Problem {
  const text = `${e?.message ?? ''} ${e?.responseText ?? ''} ${e?.response ?? ''}`;
  if (/IMAP access is disabled|not enabled for IMAP/i.test(text)) return 'imap-off';
  if (e?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|Application-specific password|535/i.test(text))
    return 'password';
  if (/^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH)$/.test(e?.code ?? '')
      || /ETIMEDOUT|ENOTFOUND|socket|timeout/i.test(text)) return 'offline';
  return 'other';
}

export class MailService {
  running = false;
  private online = true;
  private syncTimer: NodeJS.Timeout | null = null;
  private outboxTimer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(private deps: MailDeps) {}

  private async account(): Promise<Account | null> {
    const address = await getState(await this.deps.db(), 'address');
    return address ? this.deps.loadAccount(address) : null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.syncTimer = setInterval(() => void this.tick(), SYNC_EVERY_MS);
    this.outboxTimer = setInterval(() => void this.flushIfQueued(), OUTBOX_EVERY_MS);
    void this.tick();
  }

  stop() {
    this.running = false;
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.outboxTimer) clearInterval(this.outboxTimer);
    this.syncTimer = this.outboxTimer = null;
  }

  /** Runs `fn` with a connected IMAP client; records problems. */
  private async withImap<T>(fn: (c: ImapLike, a: Account) => Promise<T>): Promise<T | null> {
    const db = await this.deps.db();
    const a = await this.account();
    if (!a) return null;
    const client = this.deps.makeImap(a);
    try {
      await client.connect();
      const out = await fn(client, a);
      this.online = true;
      await setState(db, 'last_error', null);
      return out;
    } catch (e) {
      await this.problem(e);
      return null;
    } finally {
      try { await client.logout(); } catch { /* already closed */ }
    }
  }

  private async problem(e: unknown) {
    const db = await this.deps.db();
    const kind = classify(e);
    if (kind === 'offline') { this.online = false; return; }
    const message = kind === 'password' ? ERR_PASSWORD : kind === 'imap-off' ? ERR_IMAP_OFF
      : `Mail problem: ${String((e as any)?.message ?? e).slice(0, 200)}`;
    await setState(db, 'last_error', message);
    if (kind === 'password' || kind === 'imap-off') this.stop();
    this.deps.notify();
  }

  /** One sync + outbox flush. A call while one is running waits for that one instead of starting another. */
  tick(): Promise<void> {
    if (!this.inFlight) {
      this.inFlight = (async () => {
        const db = await this.deps.db();
        const r = await this.withImap(c => syncInbox(db, c));
        await this.flush();
        if (r && (r.added || r.updated)) this.deps.notify();
      })().finally(() => { this.inFlight = null; });
    }
    return this.inFlight;
  }

  private async flushIfQueued() {
    const db = await this.deps.db();
    const n = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM mail_outbox WHERE state = 'queued' AND send_after <= ?",
      new Date().toISOString());
    if (n?.n) await this.flush();
  }

  private async flush() {
    const db = await this.deps.db();
    const a = await this.account();
    if (!a) return;
    try {
      const r = await flushOutbox(db, this.deps.makeTransport(a), a.address, new Date(), a.password);
      if (r.sent || r.failed) this.deps.notify();
    } catch (e) {
      await this.problem(e);
    }
  }

  async setup(address: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
    address = address.trim().toLowerCase();
    const candidate = { address, password: password.replace(/\s+/g, '') };
    const client = this.deps.makeImap(candidate);
    try {
      await client.connect();
      await client.mailboxOpen('INBOX');
    } catch (e) {
      const kind = classify(e);
      return { ok: false, error: kind === 'password' ? ERR_PASSWORD : kind === 'imap-off' ? ERR_IMAP_OFF
        : kind === 'offline' ? "Couldn't reach Gmail. Check the internet connection." : String((e as any)?.message ?? e) };
    } finally {
      try { await client.logout(); } catch { /* */ }
    }
    this.deps.saveAccount(address, candidate.password);
    const db = await this.deps.db();
    await setState(db, 'address', address);
    await setState(db, 'last_error', null);
    this.start();
    return { ok: true };
  }

  async forget() {
    const db = await this.deps.db();
    const address = await getState(db, 'address');
    this.stop();
    if (address) this.deps.forgetAccount(address);
    await setState(db, 'address', null);
  }

  async status() {
    const db = await this.deps.db();
    const address = await getState(db, 'address');
    const unread = await db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM mail_message WHERE unread = 1 AND archived = 0 AND filtered = 0');
    return {
      configured: !!address && !!this.deps.loadAccount(address),
      address: address ?? undefined,
      online: this.online,
      lastSync: (await getState(db, 'last_sync')) ?? undefined,
      error: (await getState(db, 'last_error')) ?? undefined,
      unread: unread?.n ?? 0,
      problems: await problemMail(db),           // mail Gmail refused: Retry / Discard in the Inbox
    };
  }

  /** Read on Gmail too (and locally right away). */
  async markRead(id: number, read: boolean) {
    const db = await this.deps.db();
    await db.run('UPDATE mail_message SET unread = ? WHERE id = ?', read ? 0 : 1, id);
    const row = await db.get<{ gm_msgid: string }>('SELECT gm_msgid FROM mail_message WHERE id = ?', id);
    if (row) {
      await this.withImap(async c => {
        await c.mailboxOpen('INBOX');
        const uid = await uidFor(c, row.gm_msgid);
        if (uid == null) return false;
        return read ? c.messageFlagsAdd([uid], ['\\Seen'], { uid: true })
                    : c.messageFlagsRemove([uid], ['\\Seen'], { uid: true });
      });
    }
  }

  /** Archive = take away the Inbox label; the mail stays in All Mail. Never deletes. */
  async archive(id: number) {
    const db = await this.deps.db();
    await db.run('UPDATE mail_message SET archived = 1 WHERE id = ?', id);
    const row = await db.get<{ gm_msgid: string }>('SELECT gm_msgid FROM mail_message WHERE id = ?', id);
    if (row) {
      await this.withImap(async c => {
        await c.mailboxOpen('INBOX');
        const uid = await uidFor(c, row.gm_msgid);
        return uid == null ? false : c.messageFlagsRemove([uid], ['\\Inbox'], { uid: true, useLabels: true });
      });
    }
    this.deps.notify();
  }

  /** The full message source (for attachments), fetched by uid. */
  async source(uid: number): Promise<Buffer | null> {
    return this.withImap(async c => {
      await c.mailboxOpen('INBOX');
      for await (const f of c.fetch([uid], { uid: true, flags: true, emailId: true, threadId: true, source: true },
                                    { uid: true })) return f.source ?? null;
      return null;
    });
  }
}
