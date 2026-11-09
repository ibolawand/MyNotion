/**
 * Sending goes through the mail_outbox table: MyNotion and Aria both queue there, and whoever flushes claims a row
 * with a conditional UPDATE first, so a mail is never sent twice. Aria's mail waits 10 s (send_after) for "undo".
 * Sent mail lands in Gmail's "Sent" by itself (Gmail's SMTP does that).
 */
import type { Database } from 'sqlite';

export const OFFLINE_RETRY_MS = 60 * 1000;

/** No connection (as opposed to Gmail refusing the mail): try again later instead of giving up. */
export function isOffline(e: any): boolean {
  return /^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ESOCKET|ECONNECTION)$/
    .test(e?.code ?? '') || /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ENETUNREACH|socket hang up|Connection closed/i.test(String(e?.message ?? ''));
}

export interface Transport { sendMail(m: Record<string, unknown>): Promise<unknown>; }

export interface Draft {
  clientId: string; to: string; cc?: string; subject: string; body: string; inReplyToId?: number;
  attachments?: string[]; createdBy: 'mynotion' | 'aria'; sendAfter?: Date;
}

export async function queueMail(db: Database, d: Draft, now = new Date()): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO mail_outbox (client_id, to_addrs, cc, subject, body, in_reply_to, attachments, state,
       created_by, created_at, send_after) VALUES (?,?,?,?,?,?,?, 'queued', ?,?,?)`,
    d.clientId, d.to, d.cc ?? '', d.subject, d.body, d.inReplyToId ?? null, JSON.stringify(d.attachments ?? []),
    d.createdBy, now.toISOString(), (d.sendAfter ?? now).toISOString());
}

export function replySubject(subject: string): string {
  return /^\s*re:/i.test(subject) ? subject.trim() : `Re: ${subject.trim()}`;
}

interface OutboxRow {
  client_id: string; to_addrs: string; cc: string; subject: string; body: string; in_reply_to: number | null;
  attachments: string;
}

export async function flushOutbox(db: Database, transport: Transport, from: string, now = new Date(),
                                  secret = ''): Promise<{ sent: number; failed: number }> {
  const due = await db.all<OutboxRow[]>(
    "SELECT * FROM mail_outbox WHERE state = 'queued' AND send_after <= ? ORDER BY created_at", now.toISOString());
  let sent = 0, failed = 0;
  for (const row of due) {
    const claim = await db.run("UPDATE mail_outbox SET state = 'sending' WHERE client_id = ? AND state = 'queued'",
      row.client_id);
    if (!claim.changes) continue;              // someone else (Aria / another flush) took it
    const msg: Record<string, unknown> = {
      from, to: row.to_addrs, subject: row.subject, text: row.body,
      attachments: (JSON.parse(row.attachments || '[]') as string[]).map(path => ({ path })),
    };
    if (row.cc) msg['cc'] = row.cc;
    if (row.in_reply_to != null) {
      const orig = await db.get<{ message_id: string | null; subject: string }>(
        'SELECT message_id, subject FROM mail_message WHERE id = ?', row.in_reply_to);
      if (orig) {
        msg['subject'] = replySubject(row.subject || orig.subject);
        if (orig.message_id) { msg['inReplyTo'] = orig.message_id; msg['references'] = orig.message_id; }
      }
    }
    try {
      await transport.sendMail(msg);
      await db.run("UPDATE mail_outbox SET state = 'sent', sent_at = ?, error = NULL WHERE client_id = ?",
        new Date().toISOString(), row.client_id);
      sent++;
    } catch (e: any) {
      let error = String(e?.message ?? e);
      if (secret) error = error.split(secret).join('***');
      if (isOffline(e)) {
        // waits in the outbox and goes out once Gmail can be reached
        await db.run("UPDATE mail_outbox SET state = 'queued', error = ?, send_after = ? WHERE client_id = ?",
          error, new Date(now.getTime() + OFFLINE_RETRY_MS).toISOString(), row.client_id);
      } else {
        await db.run("UPDATE mail_outbox SET state = 'failed', error = ? WHERE client_id = ?", error, row.client_id);
        failed++;
      }
    }
  }
  return { sent, failed };
}

/** Mail Gmail refused (too big, bad address…): shown in the Inbox with Retry / Discard. */
export async function problemMail(db: Database) {
  return db.all<{ client_id: string; to_addrs: string; subject: string; error: string }[]>(
    "SELECT client_id, to_addrs, subject, error FROM mail_outbox WHERE state = 'failed' ORDER BY created_at");
}

export async function retryMail(db: Database, clientId: string, now = new Date()) {
  await db.run("UPDATE mail_outbox SET state = 'queued', error = NULL, send_after = ? WHERE client_id = ? AND state = 'failed'",
    now.toISOString(), clientId);
}

export async function discardMail(db: Database, clientId: string) {
  await db.run("UPDATE mail_outbox SET state = 'cancelled' WHERE client_id = ? AND state = 'failed'", clientId);
}
