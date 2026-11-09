/** The Inbox's IPC ("mail:*") and the real Gmail connections. Started from index.ts after the DB is open. */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { DB } from '../database/database';
import { forgetAccount, loadAccount, saveAccount } from './account';
import { ImapLike, MailService, withErrorListener } from './service';
import { getMessage, listMessages } from './store';
import { discardMail, queueMail, retryMail } from './send';

function notifyWindows() {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('db-changed');
}

export function startMail(): MailService {
  const service = new MailService({
    db: () => DB.getConnection(),
    loadAccount, saveAccount, forgetAccount,
    makeImap: a => withErrorListener(new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, logger: false,
                                                   auth: { user: a.address, pass: a.password } })) as unknown as ImapLike,
    makeTransport: a => nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true,
                                                    auth: { user: a.address, pass: a.password } }),
    notify: notifyWindows,
  });

  ipcMain.handle('mail:setup', (_e, address: string, password: string) => service.setup(address, password));
  ipcMain.handle('mail:status', () => service.status());
  ipcMain.handle('mail:forget', () => service.forget());
  ipcMain.handle('mail:refresh', () => service.tick());
  ipcMain.handle('mail:list', async (_e, opts: { view: 'inbox' | 'filtered'; query?: string }) =>
    listMessages(await DB.getConnection(), opts));
  ipcMain.handle('mail:get', async (_e, id: number) => {
    const m = await getMessage(await DB.getConnection(), id);
    if (m && m.unread) void service.markRead(id, true);
    return m;
  });
  ipcMain.handle('mail:mark-read', (_e, id: number, read: boolean) => service.markRead(id, read));
  ipcMain.handle('mail:archive', (_e, id: number) => service.archive(id));
  ipcMain.handle('mail:not-junk', async (_e, id: number) => {
    const db = await DB.getConnection();
    const m = await db.get<{ from_addr: string }>('SELECT from_addr FROM mail_message WHERE id = ?', id);
    if (!m) return;
    await db.run("INSERT OR IGNORE INTO mail_sender_rule (addr, rule) VALUES (?, 'always_show')", m.from_addr);
    await db.run('UPDATE mail_message SET filtered = 0, filter_reason = NULL WHERE from_addr = ?', m.from_addr);
    notifyWindows();
  });
  ipcMain.handle('mail:send', async (_e, d: { to: string; cc?: string; subject: string; body: string;
                                             inReplyToId?: number; attachments?: string[] }) => {
    const db = await DB.getConnection();
    const clientId = crypto.randomUUID();
    await queueMail(db, { ...d, clientId, createdBy: 'mynotion' });
    await service.tick();
    // what really happened to it: sent, waiting (offline) or refused by Gmail
    return db.get<{ state: string; error: string | null }>('SELECT state, error FROM mail_outbox WHERE client_id = ?', clientId);
  });
  ipcMain.handle('mail:retry', async (_e, clientId: string) => {
    await retryMail(await DB.getConnection(), clientId);
    await service.tick();
    return service.status();
  });
  ipcMain.handle('mail:discard', async (_e, clientId: string) => {
    await discardMail(await DB.getConnection(), clientId);
    return service.status();
  });
  ipcMain.handle('mail:pick-attachments', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    return r.canceled ? [] : r.filePaths;
  });
  // opens one attachment with the system's app for it, only when asked from the window
  ipcMain.handle('mail:attachment', async (_e, attachmentId: number) => {
    const db = await DB.getConnection();
    const a = await db.get<{ id: number; message_id: number; filename: string; part_id: string; cached_path: string | null; uid: number }>(
      `SELECT a.*, m.uid FROM mail_attachment a JOIN mail_message m ON m.id = a.message_id WHERE a.id = ?`, attachmentId);
    if (!a) return { ok: false, error: 'Attachment not found.' };
    let file = a.cached_path && fs.existsSync(a.cached_path) ? a.cached_path : null;
    if (!file) {
      const source = a.uid != null ? await service.source(a.uid) : null;
      if (!source) return { ok: false, error: "Couldn't download it from Gmail." };
      const part = (await simpleParser(source)).attachments[Number(a.part_id)];
      if (!part) return { ok: false, error: 'Attachment not found in the email.' };
      const dir = path.join(app.getPath('userData'), 'mail-cache', String(a.message_id));
      fs.mkdirSync(dir, { recursive: true });
      file = path.join(dir, path.basename(a.filename || `attachment-${a.id}`));
      fs.writeFileSync(file, part.content);
      await db.run('UPDATE mail_attachment SET cached_path = ? WHERE id = ?', file, a.id);
    }
    const error = await shell.openPath(file);
    return error ? { ok: false, error } : { ok: true };
  });

  void service.status().then(s => { if (s.configured) service.start(); });
  return service;
}
