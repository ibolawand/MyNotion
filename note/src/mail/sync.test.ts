import { beforeEach, describe, expect, it } from 'vitest';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { MAIL_SCHEMA } from './schema';
import { syncInbox, MailClient, FetchedMessage } from './sync';
import { getState, listMessages, setState } from './store';

function raw(opts: { id: string; from?: string; subject?: string | null; body?: string; html?: string; headers?: string[];
                     charset?: string; date?: string }): Buffer {
  const lines = [
    `From: ${opts.from ?? 'Sara K <sara@gmail.com>'}`,
    'To: lala@gmail.com',
    ...(opts.subject === null ? [] : [`Subject: ${opts.subject ?? 'hello'}`]),
    `Date: ${opts.date ?? 'Sat, 07 Nov 2026 10:00:00 +0100'}`,
    `Message-ID: <${opts.id}@mail.example>`,
    ...(opts.headers ?? []),
    'MIME-Version: 1.0',
  ];
  if (opts.html) lines.push('Content-Type: text/html; charset=utf-8', '', opts.html);
  else lines.push(`Content-Type: text/plain; charset=${opts.charset ?? 'utf-8'}`, 'Content-Transfer-Encoding: 8bit', '', opts.body ?? 'hi there');
  return Buffer.from(lines.join('\r\n'), opts.charset === 'iso-8859-1' ? 'latin1' : 'utf8');
}

class FakeGmail implements MailClient {
  uidValidity = 1n;
  msgs = new Map<number, { source: Buffer; seen: boolean; emailId: string }>();
  fetches = 0;
  add(uid: number, source: Buffer, seen = false) { this.msgs.set(uid, { source, seen, emailId: `gm${uid}` }); }
  async connect() {}
  async logout() {}
  async mailboxOpen() { return { uidValidity: this.uidValidity }; }
  refuse = false;
  async search(): Promise<number[] | false> { return this.refuse ? false : [...this.msgs.keys()]; }
  async *fetch(uids: number[], what: { source?: boolean }): AsyncIterable<FetchedMessage> {
    for (const uid of uids) {
      const m = this.msgs.get(uid);
      if (!m) continue;
      if (what.source) this.fetches++;
      yield { uid, flags: new Set(m.seen ? ['\\Seen'] : []), emailId: m.emailId, threadId: 't' + uid,
              source: what.source ? m.source : undefined };
    }
  }
}

let db: Database;
let gmail: FakeGmail;
beforeEach(async () => {
  db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(MAIL_SCHEMA);
  gmail = new FakeGmail();
});

describe('syncInbox', () => {
  it('adds_new_primary_mail', async () => {
    gmail.add(1, raw({ id: 'a', subject: 'Project deadline', from: 'Mr Huber <huber@school.example>' }));
    gmail.add(2, raw({ id: 'b' }), true);
    expect(await syncInbox(db, gmail)).toEqual({ added: 2, updated: 0 });
    const rows = await listMessages(db, { view: 'inbox' });
    expect(rows.map(r => [r.subject, r.from_name, r.unread])).toEqual(
      expect.arrayContaining([['Project deadline', 'Mr Huber', 1], ['hello', 'Sara K', 0]]));
    expect(await getState(db, 'last_uid')).toBe('2');
  });

  it('filters_newsletters', async () => {
    gmail.add(1, raw({ id: 'n', from: 'news@medium.com', headers: ['List-Unsubscribe: <https://medium.com/u>'] }));
    await syncInbox(db, gmail);
    expect(await listMessages(db, { view: 'inbox' })).toHaveLength(0);
    const [f] = await listMessages(db, { view: 'filtered' });
    expect([f.filtered, f.filter_reason]).toEqual([1, 'newsletter']);
  });

  it('parses_awkward_messages', async () => {
    gmail.add(1, raw({ id: 'x', subject: null }));
    gmail.add(2, raw({ id: 'y', charset: 'iso-8859-1', body: 'Grüße aus Linz' }));
    gmail.add(3, raw({ id: 'z', html: '<p>Only <b>HTML</b> here</p>' }));
    await syncInbox(db, gmail);
    const rows = await listMessages(db, { view: 'inbox' });
    const by = (id: string) => rows.find(r => r.message_id === `<${id}@mail.example>`)!;
    expect(by('x').subject).toBe('(no subject)');
    expect(by('y').preview).toBe('Grüße aus Linz');
    expect(by('z').preview).toBe('Only HTML here');
  });

  it('rerun_adds_no_duplicates', async () => {
    gmail.add(1, raw({ id: 'a' }));
    await syncInbox(db, gmail);
    await setState(db, 'last_uid', '0');            // as if the first run died before saving its progress
    await syncInbox(db, gmail);
    expect(await listMessages(db, { view: 'inbox' })).toHaveLength(1);
  });

  it('uidvalidity_change_resyncs', async () => {
    gmail.add(5, raw({ id: 'a' }));
    await syncInbox(db, gmail);
    gmail.uidValidity = 2n;                          // Gmail renumbered everything
    gmail.msgs = new Map([[1, { source: raw({ id: 'a' }), seen: true, emailId: 'gm5' }]]);
    await syncInbox(db, gmail);
    const rows = await listMessages(db, { view: 'inbox' });
    expect(rows).toHaveLength(1);
    expect([rows[0].uid, rows[0].unread]).toEqual([1, 0]);
  });

  it('archived_elsewhere and read elsewhere', async () => {
    gmail.add(1, raw({ id: 'a' }));
    gmail.add(2, raw({ id: 'b' }));
    await syncInbox(db, gmail);
    gmail.msgs.delete(1);                            // archived on the phone
    gmail.msgs.get(2)!.seen = true;                  // read on the phone
    const fetchesBefore = gmail.fetches;
    expect(await syncInbox(db, gmail)).toEqual({ added: 0, updated: 2 });
    expect(gmail.fetches).toBe(fetchesBefore);       // known mail isn't downloaded again
    const rows = await listMessages(db, { view: 'inbox' });
    expect(rows.map(r => [r.message_id, r.unread])).toEqual([['<b@mail.example>', 0]]);
  });

  it('a refused search changes nothing', async () => {
    gmail.add(1, raw({ id: 'a' }));
    await syncInbox(db, gmail);
    gmail.refuse = true;
    await expect(syncInbox(db, gmail)).rejects.toThrow(/search/i);
    expect(await listMessages(db, { view: 'inbox' })).toHaveLength(1);
  });

  it('one broken message does not stop the rest', async () => {
    gmail.add(1, raw({ id: 'a' }));
    gmail.msgs.set(2, { source: Buffer.alloc(0), seen: false, emailId: 'gm2' });
    gmail.add(3, raw({ id: 'c' }));
    const real = gmail.fetch.bind(gmail);
    gmail.fetch = async function* (uids, what) {
      for await (const f of real(uids, what)) yield f.uid === 2 && what.source ? { ...f, source: undefined } : f;
    };
    expect((await syncInbox(db, gmail)).added).toBe(2);
    expect(await getState(db, 'last_sync')).not.toBeNull();
  });

  it('inline logos are shown in the mail, not listed as attachments', async () => {
    const src = Buffer.from([
      'From: Shop <hi@shop.example>', 'To: lala@gmail.com', 'Subject: order', 'Message-ID: <inl@x>', 'MIME-Version: 1.0',
      'Content-Type: multipart/related; boundary="r"', '', '--r', 'Content-Type: text/html', '',
      '<p>Thanks</p><img src="cid:logo1">', '--r', 'Content-Type: image/png', 'Content-ID: <logo1>',
      'Content-Disposition: inline; filename="logo.png"', 'Content-Transfer-Encoding: base64', '', 'iVBORw0KGgo=', '--r--', ''].join('\r\n'));
    gmail.add(1, src);
    await syncInbox(db, gmail);
    const row = await db.get('SELECT has_attachments, body_html FROM mail_message');
    expect(row.has_attachments).toBe(0);
    expect(row.body_html).toContain('src="data:image/png;base64,');
    expect(await db.all('SELECT * FROM mail_attachment')).toEqual([]);
  });

  it('keeps Reply-To', async () => {
    gmail.add(1, raw({ id: 'r', headers: ['Reply-To: Class list <class@school.example>'] }));
    await syncInbox(db, gmail);
    expect((await db.get('SELECT reply_to FROM mail_message')).reply_to).toBe('class@school.example');
  });

  it('mail not found again after a renumbering leaves the inbox', async () => {
    gmail.add(5, raw({ id: 'a' }));
    gmail.add(6, raw({ id: 'b' }));
    await syncInbox(db, gmail);
    gmail.uidValidity = 2n;
    gmail.msgs = new Map([[1, { source: raw({ id: 'a' }), seen: false, emailId: 'gm5' }]]);
    await syncInbox(db, gmail);
    expect((await listMessages(db, { view: 'inbox' })).map(r => r.message_id)).toEqual(['<a@mail.example>']);
  });

  it('attachments of mail Aria stored first are filled in', async () => {
    const withFile = Buffer.from([
      'From: Mr Huber <huber@school.example>', 'To: lala@gmail.com', 'Subject: brief', 'Message-ID: <att@x>',
      'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="b"', '', '--b', 'Content-Type: text/plain', '',
      'see attached', '--b', 'Content-Type: application/pdf; name="brief.pdf"',
      'Content-Disposition: attachment; filename="brief.pdf"', 'Content-Transfer-Encoding: base64', '', 'SGVsbG8=',
      '--b--', ''].join('\r\n'));
    gmail.add(4, withFile);
    await setState(db, 'uidvalidity', '1');
    await db.run(`INSERT INTO mail_message (gm_msgid, uid, subject, has_attachments, date)
                  VALUES ('gm4', 4, 'brief', 1, '2026-11-07T09:00:00.000Z')`);
    await syncInbox(db, gmail);
    expect(await db.all('SELECT filename, part_id FROM mail_attachment')).toEqual([{ filename: 'brief.pdf', part_id: '0' }]);
  });
});
