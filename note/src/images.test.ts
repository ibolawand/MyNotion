import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mynotion-images-'));
process.env.MYNOTION_DB = path.join(dir, 'test.db');

const handlers: Record<string, (...a: any[]) => any> = {};
vi.mock('electron', () => ({
    app: { getPath: () => dir },
    ipcMain: { handle: (name: string, fn: any) => { handlers[name] = fn; } },
    protocol: { handle: (name: string, fn: any) => { handlers['protocol:' + name] = fn; }, registerSchemesAsPrivileged: () => {} },
}));

import { DB } from './database/database';
import { createImageTable, idFromUrl, removeUnusedImages, saveImage, setUpImages, sniffImage } from './images';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]);

beforeAll(async () => {
    await DB.getConnection();
    await DB.initializeTables();
    await createImageTable();
    setUpImages();
});
afterAll(async () => {
    await DB.closeConnection();
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('pictures in notes', () => {
    it('knows a picture by its first bytes, not by its name', () => {
        expect(sniffImage(PNG)).toBe('image/png');
        expect(sniffImage(JPEG)).toBe('image/jpeg');
        expect(sniffImage(new TextEncoder().encode('GIF89a...'))).toBe('image/gif');
        expect(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
        expect(sniffImage(new TextEncoder().encode('<svg onload="x()">'))).toBeNull();
        expect(sniffImage(new Uint8Array([]))).toBeNull();
    });

    it('reads only its own links', () => {
        expect(idFromUrl('mynotion-image://image/12')).toBe(12);
        expect(idFromUrl('mynotion-image://image/12/')).toBe(12);
        expect(idFromUrl('mynotion-image://image/../etc/passwd')).toBeNull();
        expect(idFromUrl('https://example.com/image/12')).toBeNull();
    });

    it('stores a picture once and gives back a link the window can load', async () => {
        const a = await saveImage(PNG);
        const b = await saveImage(PNG);
        expect(a.ok && b.ok && a.id === b.id).toBe(true);
        if (!a.ok) return;
        expect(a.url).toBe(`mynotion-image://image/${a.id}`);
        const res: Response = await handlers['protocol:mynotion-image']({ url: a.url });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/png');
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
        expect((await handlers['protocol:mynotion-image']({ url: 'mynotion-image://image/99999' })).status).toBe(404);
    });

    it('turns away anything that is not a picture, and pictures that are too big', async () => {
        expect(await saveImage(new TextEncoder().encode('<html>'))).toEqual({ ok: false, error: expect.stringContaining('PNG') });
        const big = new Uint8Array(15 * 1024 * 1024 + 1); big.set(PNG);
        expect((await saveImage(big)).ok).toBe(false);
        expect((await handlers['image:save']({}, 'not bytes')).ok).toBe(false);
    });

    it('cleans up only old pictures that no note links to', async () => {
        const db = await DB.getConnection();
        const used = await saveImage(JPEG), unused = await saveImage(new Uint8Array([...PNG, 7]));
        if (!used.ok || !unused.ok) throw new Error('not saved');
        await db.run(`INSERT INTO notes (title, content, userID) VALUES ('n', ?, 1)`, [`<p>x</p><img src="${used.url}">`]);
        expect(await removeUnusedImages()).toBe(0);                          // both still new
        await db.run(`UPDATE images SET created_at = datetime('now', '-40 days')`);
        expect(await removeUnusedImages()).toBeGreaterThanOrEqual(1);       // the unused one (and the first PNG) go
        const left = (await db.all<{ id: number }[]>('SELECT id FROM images')).map(r => r.id);
        expect(left).toContain(used.id);
        expect(left).not.toContain(unused.id);
    });
});
