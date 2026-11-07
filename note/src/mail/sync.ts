/**
 * Brings Gmail's Primary inbox into noted.db. Only INBOX, only category:primary (Gmail's own sorting keeps out
 * Promotions/Social/Updates; Spam is never opened), the last 3 months. New mail is downloaded once; for mail we
 * already have, only the flags are checked (read on the phone -> read here; gone from INBOX -> archived).
 */
import type { Database } from 'sqlite';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import { filterReason } from './filter';
import { alwaysShow, getState, setState, upsertMessage } from './store';

export const PRIMARY_QUERY = 'category:primary newer_than:90d';
const PREVIEW_CHARS = 200;
const BATCH = 25;

export interface FetchedMessage {
  uid: number; flags?: Set<string>; emailId?: string; threadId?: string; source?: Buffer;
}

/** The part of ImapFlow this uses, so tests can pass a fake Gmail. */
export interface MailClient {
  connect(): Promise<void>;
  logout(): Promise<void>;
  mailboxOpen(path: string): Promise<{ uidValidity: bigint | number }>;
  search(query: { gmraw?: string; emailId?: string }, opts: { uid: true }): Promise<number[] | false>;
  fetch(uids: number[], what: { uid: true; flags: true; emailId: true; threadId: true; source?: boolean },
        opts: { uid: true }): AsyncIterable<FetchedMessage>;
}

export function htmlToText(html: string): string {
  return html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function addrs(a: AddressObject | AddressObject[] | undefined): string {
  const list = Array.isArray(a) ? a : a ? [a] : [];
  return list.flatMap(x => x.value).map(v => (v.name ? `${v.name} <${v.address}>` : v.address ?? '')).join(', ');
}

export async function parseMessage(f: FetchedMessage, keep: Set<string>) {
  const p: ParsedMail = await simpleParser(f.source!);
  const from = p.from?.value[0] ?? { name: '', address: '' };
  const headers: Record<string, string> = {};
  for (const h of p.headerLines) headers[h.key] = h.line.slice(h.line.indexOf(':') + 1).trim();
  const text = (p.text ?? '').trim() || htmlToText(typeof p.html === 'string' ? p.html : '').trim();
  const reason = filterReason(headers, from.address ?? '', { alwaysShow: keep });
  return {
    gm_msgid: f.emailId ?? `uid:${f.uid}:${p.messageId ?? ''}`, gm_thrid: f.threadId, uid: f.uid,
    message_id: p.messageId ?? undefined,
    from_name: from.name || from.address || '', from_addr: (from.address ?? '').toLowerCase(),
    to_addrs: addrs(p.to), cc: addrs(p.cc),
    subject: (p.subject ?? '').trim() || '(no subject)',
    date: (p.date ?? new Date()).toISOString(),
    preview: text.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_CHARS),
    body_text: text, body_html: typeof p.html === 'string' ? p.html : '',
    has_attachments: p.attachments.length ? 1 : 0,
    unread: f.flags?.has('\\Seen') ? 0 : 1,
    filtered: reason ? 1 : 0, filter_reason: reason,
    attachments: p.attachments.map((a, i) => ({ filename: a.filename ?? `attachment ${i + 1}`, mime: a.contentType,
                                                size: a.size, part_id: String(i) })),
  };
}

/** Mail Aria stored first (she doesn't list attachments): fetch it once more and fill in its attachment list. */
async function fillAttachments(db: Database, client: MailClient, current: number[], keep: Set<string>) {
  const missing = await db.all<{ uid: number }[]>(
    `SELECT m.uid FROM mail_message m WHERE m.has_attachments = 1 AND m.uid IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM mail_attachment a WHERE a.message_id = m.id) LIMIT 20`);
  const uids = missing.map(r => r.uid).filter(u => current.includes(u));
  if (!uids.length) return;
  for await (const f of client.fetch(uids, { uid: true, flags: true, emailId: true, threadId: true, source: true },
                                     { uid: true })) {
    try {
      const m = await parseMessage(f, keep);
      const row = await db.get<{ id: number }>('SELECT id FROM mail_message WHERE uid = ?', f.uid);
      for (const a of m.attachments) {
        await db.run('INSERT INTO mail_attachment (message_id, filename, mime, size, part_id) VALUES (?,?,?,?,?)',
          row!.id, a.filename, a.mime, a.size, a.part_id);
      }
    } catch (e) {
      console.error(`[mail] couldn't list attachments of ${f.uid}:`, e);
    }
  }
}

export async function syncInbox(db: Database, client: MailClient, now = new Date()): Promise<{ added: number; updated: number }> {
  const box = await client.mailboxOpen('INBOX');
  const validity = String(box.uidValidity);
  if ((await getState(db, 'uidvalidity')) !== validity) {
    // new numbering: forget the old uids, rows are matched again by their Gmail id
    await db.run('UPDATE mail_message SET uid = NULL');
    await setState(db, 'uidvalidity', validity);
    await setState(db, 'last_uid', '0');
  }
  const found = await client.search({ gmraw: PRIMARY_QUERY }, { uid: true });
  // false = Gmail refused the search (busy, throttled). Treating that as "empty" would archive the whole inbox.
  if (!Array.isArray(found)) throw new Error('Gmail refused the inbox search; trying again later');
  const current = found;
  const known = new Map<number, { id: number; unread: number }>();
  for (const r of await db.all<{ id: number; uid: number; unread: number }[]>(
      'SELECT id, uid, unread FROM mail_message WHERE uid IS NOT NULL AND archived = 0')) known.set(r.uid, r);

  const keep = await alwaysShow(db);
  const fresh = current.filter(u => !known.has(u)).sort((a, b) => b - a);   // newest first
  let added = 0, updated = 0;
  for (let i = 0; i < fresh.length; i += BATCH) {
    for await (const f of client.fetch(fresh.slice(i, i + BATCH),
        { uid: true, flags: true, emailId: true, threadId: true, source: true }, { uid: true })) {
      try {
        const before = await db.get('SELECT 1 FROM mail_message WHERE gm_msgid = ?', f.emailId ?? '');
        await upsertMessage(db, await parseMessage(f, keep));
        if (before) updated++; else added++;
      } catch (e) {
        // one mail that can't be read doesn't stop the others (it's tried again next time)
        console.error(`[mail] couldn't read message ${f.uid}:`, e);
      }
    }
  }

  // mail we already had: read/unread from Gmail, and anything no longer in the inbox is archived
  const stillThere = current.filter(u => known.has(u));
  for (let i = 0; i < stillThere.length; i += 200) {
    for await (const f of client.fetch(stillThere.slice(i, i + 200),
        { uid: true, flags: true, emailId: true, threadId: true }, { uid: true })) {
      const row = known.get(f.uid)!;
      const unread = f.flags?.has('\\Seen') ? 0 : 1;
      if (unread !== row.unread) {
        await db.run('UPDATE mail_message SET unread = ? WHERE id = ?', unread, row.id);
        updated++;
      }
    }
  }
  await fillAttachments(db, client, current, keep);
  const inbox = new Set(current);
  for (const [uid, row] of known) {
    if (!inbox.has(uid)) {
      await db.run('UPDATE mail_message SET archived = 1 WHERE id = ?', row.id);
      updated++;
    }
  }
  if (current.length) await setState(db, 'last_uid', String(Math.max(...current)));
  await setState(db, 'last_sync', now.toISOString());
  return { added, updated };
}
