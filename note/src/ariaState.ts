/** MyNotion and Aria share a small table in the database:
 *   open_note     the note open here, so "organise this note" to Aria knows which one is meant
 *   aria_editing  the note Aria is reworking right now: MyNotion shows "Aria is editing…" and doesn't let you type
 *                 in it, so neither her changes nor your typing get lost. A lock older than LOCK_FOR_S is ignored
 *                 (Aria stopped half-way). */
import { ipcMain } from 'electron';
import { DB } from './database/database';

export const APP_STATE_SQL = `CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`;
export const LOCK_FOR_S = 180;

type Row = { value: string | null; updated_at: string | null } | undefined;

/** The note Aria is editing, or null (none, or the lock is too old). */
export function lockedNote(row: Row, now = Date.now()): number | null {
    if (!row?.value || !/^\d{1,12}$/.test(row.value) || !row.updated_at) return null;
    const at = Date.parse(row.updated_at.replace(' ', 'T') + 'Z');      // SQLite's CURRENT_TIMESTAMP is UTC
    if (!Number.isFinite(at) || now - at > LOCK_FOR_S * 1000) return null;
    return Number(row.value);
}

async function setState(key: string, value: string | null) {
    const db = await DB.getConnection();
    await db.run(`INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, key, value);
}

let openNote: number | null = null;

/** Called once at start: the table, and no note open yet. */
export async function setUpAriaState() {
    const db = await DB.getConnection();
    await db.exec(APP_STATE_SQL);
    await setState('open_note', null);
    ipcMain.handle('state:open-note', async (_e, id: unknown) => {
        const value = typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
        if (value === openNote) return;                 // every write wakes the database watcher: only real changes
        openNote = value;
        try { await setState('open_note', value === null ? null : String(value)); }
        catch (err) { console.error('state:open-note error:', err); }
    });
    ipcMain.handle('state:aria-editing', async () => {
        try {
            const row = await db.get(`SELECT value, updated_at FROM app_state WHERE key = 'aria_editing'`);
            return lockedNote(row);
        } catch {
            return null;
        }
    });
}

/** On quit: nothing is open any more. */
export async function clearOpenNote() {
    try { await setState('open_note', null); } catch { /* closing anyway */ }
}
