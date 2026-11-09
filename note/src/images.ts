/**
 * Pictures in notes. They live in the database (table `images`), so the daily backups hold them too, and a note
 * only keeps a short link to one: <img src="mynotion-image://image/12">. The window loads that link through the
 * `mynotion-image` protocol below.
 *
 * Only real PNG, JPEG, GIF and WebP pictures are stored (checked by their first bytes, not by what the page says),
 * each picture once (by its SHA-256), at most MAX_BYTES. A picture no note uses any more is removed after
 * KEEP_UNUSED_DAYS, long enough that undo, and notes brought back from a backup, still find it.
 */
import { createHash } from 'crypto';
import { ipcMain, protocol } from 'electron';
import { DB } from './database/database';

export const SCHEME = 'mynotion-image';
export const MAX_BYTES = 15 * 1024 * 1024;
const KEEP_UNUSED_DAYS = 30;

export const imageUrl = (id: number) => `${SCHEME}://image/${id}`;

/** What the bytes really are (or null when they're not a picture we take). */
export function sniffImage(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null {
    const at = (i: number, ...bytes: number[]) => bytes.every((x, k) => b[i + k] === x);
    if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
    if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
    if (b.length >= 6 && (at(0, 0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || at(0, 0x47, 0x49, 0x46, 0x38, 0x39, 0x61))) return 'image/gif';
    if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
    return null;
}

/** The image id in a mynotion-image:// link (null for anything else). */
export function idFromUrl(url: string): number | null {
    const m = /^mynotion-image:\/\/image\/(\d{1,12})\/?$/.exec(url);
    return m ? Number(m[1]) : null;
}

export async function createImageTable() {
    const db = await DB.getConnection();
    await db.exec(`
        CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT NOT NULL UNIQUE,
            mime TEXT NOT NULL,
            data BLOB NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

/** Stores a picture (or finds the same one already stored) and gives back its link. */
export async function saveImage(bytes: Uint8Array): Promise<{ ok: true; id: number; url: string } | { ok: false; error: string }> {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) return { ok: false, error: 'That file is empty.' };
    if (bytes.length > MAX_BYTES) return { ok: false, error: 'That picture is too big (more than 15 MB).' };
    const mime = sniffImage(bytes);
    if (!mime) return { ok: false, error: 'Only PNG, JPEG, GIF and WebP pictures can go into a note.' };
    const hash = createHash('sha256').update(bytes).digest('hex');
    const db = await DB.getConnection();
    await db.run('INSERT OR IGNORE INTO images (hash, mime, data) VALUES (?, ?, ?)', [hash, mime, Buffer.from(bytes)]);
    // used again: counts as new, so the clean-up doesn't take it while a note is about to use it
    await db.run('UPDATE images SET created_at = CURRENT_TIMESTAMP WHERE hash = ?', [hash]);
    const row = await db.get<{ id: number }>('SELECT id FROM images WHERE hash = ?', [hash]);
    return { ok: true, id: row!.id, url: imageUrl(row!.id) };
}

/** Removes pictures that no note has linked to for KEEP_UNUSED_DAYS. */
export async function removeUnusedImages(): Promise<number> {
    const db = await DB.getConnection();
    const res = await db.run(`
        DELETE FROM images
        WHERE created_at < datetime('now', ?)
          AND NOT EXISTS (SELECT 1 FROM notes WHERE instr(notes.content, '${SCHEME}://image/' || images.id || '"') > 0)`,
        [`-${KEEP_UNUSED_DAYS} days`]);
    return res.changes ?? 0;
}

/** Must run before the app is ready: lets the page load mynotion-image:// links like normal pictures. */
export function registerImageScheme() {
    protocol.registerSchemesAsPrivileged([
        { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
    ]);
}

export function setUpImages() {
    protocol.handle(SCHEME, async request => {
        const id = idFromUrl(request.url);
        if (id === null) return new Response('Not found', { status: 404 });
        try {
            const db = await DB.getConnection();
            const row = await db.get<{ mime: string; data: Buffer }>('SELECT mime, data FROM images WHERE id = ?', [id]);
            if (!row) return new Response('Not found', { status: 404 });
            return new Response(new Uint8Array(row.data), {
                headers: { 'Content-Type': row.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'max-age=31536000, immutable' },
            });
        } catch (err) {
            console.error('Could not load a picture:', err);
            return new Response('Error', { status: 500 });
        }
    });

    ipcMain.handle('image:save', async (_event, bytes: Uint8Array) => {
        try {
            return await saveImage(bytes);
        } catch (err) {
            console.error('Could not save a picture:', err);
            return { ok: false, error: 'The picture could not be saved.' };
        }
    });

    removeUnusedImages()
        .then(n => { if (n) console.log(`Removed ${n} picture(s) no note uses any more`); })
        .catch(err => console.error('Picture clean-up failed:', err));
}
