import { beforeEach, describe, expect, it } from 'vitest';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { MAIL_SCHEMA } from './schema';
import { MailService, ImapLike } from './service';
import { setState } from './store';

let db: Database;
const err = (props: Record<string, unknown>, message = 'failed') => Object.assign(new Error(message), props);

function imapThat(fail?: Error): ImapLike {
  return {
    connect: async () => { if (fail) throw fail; },
    logout: async () => {},
    mailboxOpen: async () => ({ uidValidity: 1n }),
    search: async () => [],
    fetch: async function* () {},
    messageFlagsAdd: async () => true,
    messageFlagsRemove: async () => true,
  };
}

function service(fail?: Error, account = true) {
  return new MailService({
    db: async () => db,
    loadAccount: () => (account ? { address: 'lala@gmail.com', password: 'pw' } : null),
    saveAccount: () => {},
    forgetAccount: () => {},
    makeImap: () => imapThat(fail),
    makeTransport: () => ({ sendMail: async () => ({}) }),
    notify: () => {},
  });
}

beforeEach(async () => {
  db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(MAIL_SCHEMA);
  await setState(db, 'address', 'lala@gmail.com');
});

describe('MailService', () => {
  it('a dropped connection is an error event, not a crash', async () => {
    const { EventEmitter } = await import('events');
    const { withErrorListener } = await import('./service');
    const client = withErrorListener(Object.assign(new EventEmitter(), imapThat()) as any);
    expect(() => client.emit('error', new Error('read ECONNRESET'))).not.toThrow();
  });

  it('archive finds the mail by its Gmail id, not a stored uid that may be stale', async () => {
    const calls: unknown[] = [];
    const imap = { ...imapThat(), search: async (q: unknown) => { calls.push(['search', q]); return [42]; },
                   messageFlagsRemove: async (...a: unknown[]) => { calls.push(['remove', ...a]); return true; } };
    const s = new MailService({ db: async () => db, loadAccount: () => ({ address: 'lala@gmail.com', password: 'pw' }),
      saveAccount: () => {}, forgetAccount: () => {}, makeImap: () => imap as unknown as ImapLike,
      makeTransport: () => ({ sendMail: async () => ({}) }), notify: () => {} });
    await db.run("INSERT INTO mail_message (id, gm_msgid, uid, subject, date) VALUES (1, '777', 5, 's', '2026-11-07T09:00:00.000Z')");
    await s.archive(1);
    expect(calls).toEqual([['search', { emailId: '777' }], ['remove', [42], ['\\Inbox'], { uid: true, useLabels: true }]]);
  });

  it('not set up yet', async () => {
    await setState(db, 'address', null);
    expect(await service(undefined, false).status()).toMatchObject({ configured: false });
  });

  it('a good sync is online', async () => {
    const s = service();
    await s.tick();
    expect(await s.status()).toMatchObject({ configured: true, online: true, address: 'lala@gmail.com' });
    s.stop();
  });

  it('wrong password stops trying', async () => {
    const s = service(err({ authenticationFailed: true }, 'Invalid credentials'));
    s.start();
    await s.tick();
    expect(s.running).toBe(false);
    expect((await s.status()).error).toBe(
      "Gmail didn't accept the password. Make a new app password at myaccount.google.com/apppasswords.");
  });

  it('offline keeps trying', async () => {
    const s = service(err({ code: 'ENOTFOUND' }, 'getaddrinfo ENOTFOUND imap.gmail.com'));
    s.start();
    await s.tick();
    expect(s.running).toBe(true);
    expect(await s.status()).toMatchObject({ online: false });
    s.stop();
  });

  it('setup checks the login before saving', async () => {
    const saved: string[] = [];
    const s = new MailService({
      db: async () => db, loadAccount: () => null, saveAccount: (a) => saved.push(a), forgetAccount: () => {},
      makeImap: () => imapThat(err({ authenticationFailed: true })), makeTransport: () => ({ sendMail: async () => ({}) }),
      notify: () => {},
    });
    const r = await s.setup('lala@gmail.com', 'nope');
    expect(r.ok).toBe(false);
    expect(saved).toEqual([]);
  });

  it('IMAP turned off in Gmail', async () => {
    const s = service(err({ responseText: '[ALERT] IMAP access is disabled for your account.' }));
    await s.tick();
    expect((await s.status()).error).toBe('Turn on IMAP in Gmail settings (Forwarding and POP/IMAP).');
  });

  it('mail stuck in "sending" after a crash is shown, not lost', async () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    await db.run(`INSERT INTO mail_outbox (client_id, to_addrs, subject, body, state, created_by, created_at, send_after)
                  VALUES ('c1', 'a@b.c', 's', 'b', 'sending', 'mynotion', ?, ?)`, old, old);
    await service().tick();
    const row = await db.get("SELECT state, error FROM mail_outbox WHERE client_id = 'c1'");
    expect(row.state).toBe('failed');
    expect(row.error).toMatch(/check Gmail's Sent folder/);
  });

  it('archiving offline is done later instead of coming back', async () => {
    await db.run("INSERT INTO mail_message (id, gm_msgid, uid, subject, date) VALUES (1, '777', 5, 's', '2026-11-07T09:00:00.000Z')");
    const removed: unknown[] = [];
    let online = false;
    const imap = () => ({ ...imapThat(), connect: async () => { if (!online) throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); },
      search: async (q: { emailId?: string }) => (q.emailId ? [5] : [5]),
      messageFlagsRemove: async (...a: unknown[]) => { removed.push(a); return true; } });
    const s = new MailService({ db: async () => db, loadAccount: () => ({ address: 'lala@gmail.com', password: 'pw' }),
      saveAccount: () => {}, forgetAccount: () => {}, makeImap: () => imap() as unknown as ImapLike,
      makeTransport: () => ({ sendMail: async () => ({}) }), notify: () => {} });
    await s.archive(1);
    expect(removed).toEqual([]);
    online = true;
    await s.tick();
    expect(removed).toHaveLength(1);
    expect((await db.get('SELECT archived FROM mail_message WHERE id = 1')).archived).toBe(1);
  });

  it('opening several mails quickly uses one connection to mark them read', async () => {
    let connects = 0;
    await db.run("INSERT INTO mail_message (id, gm_msgid, uid, subject, date) VALUES (1, '1', 1, 'a', 'x'), (2, '2', 2, 'b', 'x'), (3, '3', 3, 'c', 'x')");
    const s = new MailService({ db: async () => db, loadAccount: () => ({ address: 'lala@gmail.com', password: 'pw' }),
      saveAccount: () => {}, forgetAccount: () => {},
      makeImap: () => ({ ...imapThat(), connect: async () => { connects++; }, search: async (q: { emailId: string }) => [Number(q.emailId)] }) as unknown as ImapLike,
      makeTransport: () => ({ sendMail: async () => ({}) }), notify: () => {} });
    await Promise.all([s.markRead(1, true), s.markRead(2, true), s.markRead(3, true)]);
    await s.flushReads();
    expect(connects).toBe(1);
  });
});
