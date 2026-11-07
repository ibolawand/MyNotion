/** Reads and writes for the mail tables (schema.ts). */
import type { Database } from 'sqlite';

export interface StoredMessage {
  gm_msgid: string; gm_thrid?: string; uid: number | null; message_id?: string;
  from_name: string; from_addr: string; to_addrs: string; cc: string; reply_to?: string | null; subject: string; date: string;
  preview: string; body_text: string; body_html: string; has_attachments: number;
  unread: number; filtered: number; filter_reason: string | null;
  attachments?: { filename: string; mime: string; size: number; part_id: string }[];
}

export interface MessageRow extends Omit<StoredMessage, 'attachments'> { id: number; archived: number; }

/** Insert, or (same Gmail id) refresh uid/flags. Returns the row id. */
export async function upsertMessage(db: Database, m: StoredMessage): Promise<number> {
  await db.run(
    `INSERT INTO mail_message (gm_msgid, gm_thrid, uid, message_id, from_name, from_addr, to_addrs, cc, reply_to, subject,
       date, preview, body_text, body_html, has_attachments, unread, archived, filtered, filter_reason)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)
     ON CONFLICT(gm_msgid) DO UPDATE SET uid = excluded.uid, unread = excluded.unread, archived = 0`,
    m.gm_msgid, m.gm_thrid ?? null, m.uid, m.message_id ?? null, m.from_name, m.from_addr, m.to_addrs, m.cc, m.reply_to ?? null, m.subject,
    m.date, m.preview, m.body_text, m.body_html, m.has_attachments, m.unread, m.filtered, m.filter_reason);
  const row = await db.get<{ id: number }>('SELECT id FROM mail_message WHERE gm_msgid = ?', m.gm_msgid);
  if (m.attachments?.length) {
    await db.run('DELETE FROM mail_attachment WHERE message_id = ?', row!.id);
    for (const a of m.attachments) {
      await db.run('INSERT INTO mail_attachment (message_id, filename, mime, size, part_id) VALUES (?,?,?,?,?)',
        row!.id, a.filename, a.mime, a.size, a.part_id);
    }
  }
  return row!.id;
}

export async function listMessages(db: Database, opts: { view: 'inbox' | 'filtered'; query?: string; limit?: number })
    : Promise<MessageRow[]> {
  const where = ['archived = 0', opts.view === 'filtered' ? 'filtered = 1' : 'filtered = 0'];
  const args: unknown[] = [];
  if (opts.query?.trim()) {
    where.push('(subject LIKE ? OR from_name LIKE ? OR from_addr LIKE ? OR body_text LIKE ?)');
    const q = `%${opts.query.trim()}%`;
    args.push(q, q, q, q);
  }
  return db.all<MessageRow[]>(
    `SELECT id, gm_msgid, gm_thrid, uid, message_id, from_name, from_addr, to_addrs, cc, reply_to, subject, date, preview,
            '' AS body_text, '' AS body_html, has_attachments, unread, archived, filtered, filter_reason
     FROM mail_message WHERE ${where.join(' AND ')} ORDER BY date DESC LIMIT ?`, ...args, opts.limit ?? 100);
}

export async function getMessage(db: Database, id: number) {
  const m = await db.get<MessageRow>('SELECT * FROM mail_message WHERE id = ?', id);
  if (!m) return null;
  const attachments = await db.all('SELECT id, filename, mime, size FROM mail_attachment WHERE message_id = ?', id);
  return { ...m, attachments };
}

export async function setFlags(db: Database, id: number, f: { unread?: boolean; archived?: boolean }) {
  if (f.unread !== undefined) await db.run('UPDATE mail_message SET unread = ? WHERE id = ?', f.unread ? 1 : 0, id);
  if (f.archived !== undefined) await db.run('UPDATE mail_message SET archived = ? WHERE id = ?', f.archived ? 1 : 0, id);
}

export async function getState(db: Database, key: string): Promise<string | null> {
  return (await db.get<{ value: string }>('SELECT value FROM mail_state WHERE key = ?', key))?.value ?? null;
}

export async function setState(db: Database, key: string, value: string | null) {
  await db.run('INSERT INTO mail_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value);
}

export async function alwaysShow(db: Database): Promise<Set<string>> {
  const rows = await db.all<{ addr: string }[]>("SELECT addr FROM mail_sender_rule WHERE rule = 'always_show'");
  return new Set(rows.map(r => r.addr.toLowerCase()));
}
