import { beforeEach, describe, expect, it } from 'vitest';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { MAIL_SCHEMA } from './schema';
import { discardMail, flushOutbox, problemMail, queueMail, retryMail, Transport } from './send';

let db: Database;
let sent: any[];
let transport: Transport;
const NOW = new Date('2026-11-07T10:00:00Z');

beforeEach(async () => {
  db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(MAIL_SCHEMA);
  sent = [];
  transport = { sendMail: async (m: any) => { sent.push(m); await new Promise(r => setTimeout(r, 5)); return {}; } };
});

const state = async (id: string) => (await db.get('SELECT state, error FROM mail_outbox WHERE client_id = ?', id));

describe('outbox', () => {
  it('sends_queued_mail', async () => {
    await queueMail(db, { clientId: 'c1', to: 'sara@gmail.com', subject: 'hi', body: 'see you', createdBy: 'mynotion' }, NOW);
    expect(await flushOutbox(db, transport, 'lala@gmail.com', NOW)).toEqual({ sent: 1, failed: 0 });
    expect(sent[0]).toMatchObject({ from: 'lala@gmail.com', to: 'sara@gmail.com', subject: 'hi', text: 'see you' });
    expect((await state('c1')).state).toBe('sent');
  });

  it('waits_until_send_after', async () => {
    await queueMail(db, { clientId: 'c1', to: 'a@b.c', subject: 's', body: 'b', createdBy: 'aria',
                          sendAfter: new Date(NOW.getTime() + 10_000) }, NOW);
    expect((await flushOutbox(db, transport, 'me@x', NOW)).sent).toBe(0);
    expect((await flushOutbox(db, transport, 'me@x', new Date(NOW.getTime() + 11_000))).sent).toBe(1);
  });

  it('reply_threads', async () => {
    await db.run(`INSERT INTO mail_message (id, gm_msgid, message_id, subject, from_addr) VALUES (7, 'g', '<orig@x>', 'Re: Plans', 'sara@gmail.com')`);
    await queueMail(db, { clientId: 'c1', to: 'sara@gmail.com', subject: 'Re: Plans', body: 'yes', inReplyToId: 7, createdBy: 'mynotion' }, NOW);
    await flushOutbox(db, transport, 'me@x', NOW);
    expect(sent[0]).toMatchObject({ subject: 'Re: Plans', inReplyTo: '<orig@x>', references: '<orig@x>' });
  });

  it('reply_without_message_id', async () => {
    await db.run(`INSERT INTO mail_message (id, gm_msgid, subject) VALUES (8, 'h', 'Plans')`);
    await queueMail(db, { clientId: 'c1', to: 'a@b.c', subject: 'Plans', body: 'ok', inReplyToId: 8, createdBy: 'mynotion' }, NOW);
    expect((await flushOutbox(db, transport, 'me@x', NOW)).sent).toBe(1);
    expect(sent[0].subject).toBe('Re: Plans');
    expect(sent[0].inReplyTo).toBeUndefined();
  });

  it('not_sent_twice', async () => {
    await queueMail(db, { clientId: 'c1', to: 'a@b.c', subject: 's', body: 'b', createdBy: 'mynotion' }, NOW);
    await Promise.all([flushOutbox(db, transport, 'me@x', NOW), flushOutbox(db, transport, 'me@x', NOW)]);
    expect(sent).toHaveLength(1);
  });

  it('failure_is_recorded', async () => {
    const bad: Transport = { sendMail: async () => { throw new Error('535 auth failed for secretpass'); } };
    await queueMail(db, { clientId: 'c1', to: 'a@b.c', subject: 's', body: 'b', createdBy: 'mynotion' }, NOW);
    expect(await flushOutbox(db, bad, 'me@x', NOW, 'secretpass')).toEqual({ sent: 0, failed: 1 });
    const s = await state('c1');
    expect(s.state).toBe('failed');
    expect(s.error).toContain('535');
    expect(s.error).not.toContain('secretpass');
  });

  it('offline_send_waits_and_retries', async () => {
    const offline: Transport = { sendMail: async () => { throw Object.assign(new Error('getaddrinfo ENOTFOUND smtp.gmail.com'), { code: 'ENOTFOUND' }); } };
    await queueMail(db, { clientId: 'c1', to: 'a@b.c', subject: 's', body: 'b', createdBy: 'mynotion' }, NOW);
    expect(await flushOutbox(db, offline, 'me@x', NOW)).toEqual({ sent: 0, failed: 0 });
    const row = await db.get("SELECT state, send_after FROM mail_outbox WHERE client_id = 'c1'");
    expect(row.state).toBe('queued');
    expect(new Date(row.send_after).getTime()).toBeGreaterThan(NOW.getTime());
    expect((await flushOutbox(db, transport, 'me@x', new Date(NOW.getTime() + 120_000))).sent).toBe(1);
  });

  it('failed mail is listed and can be retried or discarded', async () => {
    const bad: Transport = { sendMail: async () => { throw new Error('552 message too big'); } };
    await queueMail(db, { clientId: 'c1', to: 'a@b.c', subject: 'Big', body: 'b', createdBy: 'mynotion' }, NOW);
    await flushOutbox(db, bad, 'me@x', NOW);
    expect(await problemMail(db)).toEqual([{ client_id: 'c1', to_addrs: 'a@b.c', subject: 'Big', error: '552 message too big' }]);
    await retryMail(db, 'c1', NOW);
    expect((await flushOutbox(db, transport, 'me@x', NOW)).sent).toBe(1);
    expect(await problemMail(db)).toEqual([]);
    await queueMail(db, { clientId: 'c2', to: 'a@b.c', subject: 'x', body: 'b', createdBy: 'mynotion' }, NOW);
    await flushOutbox(db, bad, 'me@x', NOW);
    await discardMail(db, 'c2');
    expect(await problemMail(db)).toEqual([]);
  });

  it('same client id is queued once', async () => {
    await queueMail(db, { clientId: 'c1', to: 'a@b.c', subject: 's', body: 'b', createdBy: 'mynotion' }, NOW);
    await queueMail(db, { clientId: 'c1', to: 'a@b.c', subject: 's', body: 'b', createdBy: 'mynotion' }, NOW);
    expect((await db.get('SELECT COUNT(*) AS n FROM mail_outbox')).n).toBe(1);
  });
});
