/** Talking to Aria from inside MyNotion (the Aria panel).
 *
 *  Aria listens on a private Unix socket (BetterAI/ui/app_bridge.py). One JSON object per line, both ways:
 *    →  {"id","type":"chat","text"}   |  {"id","type":"status"}
 *    ←  {"id","type":"text","delta"}  |  {"id","type":"done","reply","tools","confirm"}  |  {"id","type":"error","message"}
 *  "done" carries her final reply (it replaces what was streamed) and a yes/no question that is waiting.
 *
 *  Nothing here leaves the computer. If Aria isn't running, the panel offers to start her: she writes where her
 *  launcher is into the shared app_state table (key aria_launcher) every time she starts. */
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { BrowserWindow, ipcMain } from 'electron';
import { DB } from './database/database';

export type AriaEvent = { id: string } & (
    | { type: 'text'; delta: string }
    | { type: 'done'; reply: string; tools: string[]; confirm: string | null }
    | { type: 'error'; message: string });
export type AskResult = { ok: true; id: string } | { ok: false; error: 'not-running' };

const STATUS_TIMEOUT_MS = 2000;
const START_WAIT_S = 60;
export const STOPPED = 'Aria stopped answering.';

/** The same path ui/app_bridge.py builds. */
export function socketPath(env: Record<string, string | undefined> = process.env, uid: number = process.getuid?.() ?? 0): string {
    return path.join(env.XDG_RUNTIME_DIR || '/tmp', `aria-${uid}-app.sock`);
}

/** Whole lines out of what has arrived so far. Works on bytes, so a character cut in half by a chunk
 *  boundary (ö, an emoji) is only decoded once all of it is here. */
export function splitLines(buffer: Buffer, chunk: Buffer): { lines: string[]; rest: Buffer } {
    let rest = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    const lines: string[] = [];
    let i: number;
    while ((i = rest.indexOf(0x0a)) >= 0) {
        lines.push(rest.subarray(0, i).toString('utf8'));
        rest = rest.subarray(i + 1);
    }
    return { lines, rest };
}

export class AriaLink {
    private sock: net.Socket | null = null;
    private connecting: Promise<net.Socket | null> | null = null;
    private open = new Set<string>();                               // chat requests still being answered
    private waiting = new Map<string, (running: boolean) => void>(); // status requests

    constructor(private file: string, private emit: (e: AriaEvent) => void) {}

    private connect(): Promise<net.Socket | null> {
        if (this.sock) return Promise.resolve(this.sock);
        if (this.connecting) return this.connecting;
        this.connecting = new Promise(resolve => {
            const sock = net.connect(this.file);
            let rest: Buffer = Buffer.alloc(0);
            let done = false;
            const settle = (value: net.Socket | null) => {
                if (done) return;
                done = true;
                this.connecting = null;
                resolve(value);
            };
            sock.once('connect', () => { this.sock = sock; settle(sock); });
            sock.on('data', chunk => {
                const r = splitLines(rest, chunk);
                rest = r.rest;
                r.lines.forEach(l => this.onLine(l));
            });
            sock.on('error', () => { /* 'close' follows */ });
            sock.on('close', () => {
                if (this.sock === sock) this.sock = null;
                settle(null);
                this.dropped();
            });
        });
        return this.connecting;
    }

    private onLine(line: string) {
        let e: any;
        try { e = JSON.parse(line); } catch { return; }
        if (!e || typeof e !== 'object' || typeof e.id !== 'string') return;
        if (e.type === 'status') {
            this.waiting.get(e.id)?.(true);
            return;
        }
        if (!this.open.has(e.id)) return;
        if (e.type === 'text' && typeof e.delta === 'string') {
            this.emit({ id: e.id, type: 'text', delta: e.delta });
        } else if (e.type === 'done') {
            this.open.delete(e.id);
            this.emit({
                id: e.id, type: 'done', reply: typeof e.reply === 'string' ? e.reply : '',
                tools: Array.isArray(e.tools) ? e.tools.filter((t: unknown) => typeof t === 'string') : [],
                confirm: typeof e.confirm === 'string' ? e.confirm : null,
            });
        } else if (e.type === 'error') {
            this.open.delete(e.id);
            this.emit({ id: e.id, type: 'error', message: typeof e.message === 'string' ? e.message : STOPPED });
        }
    }

    /** The connection is gone: whatever was still being answered never will be. */
    private dropped() {
        const ids = [...this.open];
        this.open.clear();
        ids.forEach(id => this.emit({ id, type: 'error', message: STOPPED }));
        [...this.waiting.values()].forEach(done => done(false));
    }

    private write(sock: net.Socket, obj: unknown): boolean {
        try { sock.write(JSON.stringify(obj) + '\n'); return true; } catch { return false; }
    }

    async ask(text: string): Promise<AskResult> {
        const sock = await this.connect();
        if (!sock) return { ok: false, error: 'not-running' };
        const id = randomUUID();
        this.open.add(id);
        if (!this.write(sock, { id, type: 'chat', text })) {
            this.open.delete(id);
            return { ok: false, error: 'not-running' };
        }
        return { ok: true, id };
    }

    async status(): Promise<'running' | 'not-running'> {
        const sock = await this.connect();
        if (!sock) return 'not-running';
        // she answers one request at a time: while a message is being answered a status request would wait
        // behind it (and time out), but an open connection with a reply on its way already says she's there
        if (this.open.size) return 'running';
        const id = randomUUID();
        const running = await new Promise<boolean>(resolve => {
            const timer = setTimeout(() => resolve(false), STATUS_TIMEOUT_MS);
            this.waiting.set(id, r => { clearTimeout(timer); resolve(r); });
            if (!this.write(sock, { id, type: 'status' })) { clearTimeout(timer); resolve(false); }
        });
        this.waiting.delete(id);
        return running ? 'running' : 'not-running';
    }

    close() {
        this.sock?.destroy();
        this.sock = null;
    }
}

/** Aria's launcher, as she wrote it down: only an existing aria.sh with a full path is ever started. */
export function launcherFrom(value: unknown, exists: (p: string) => boolean = p => fs.existsSync(p)): string | null {
    if (typeof value !== 'string' || !path.isAbsolute(value) || path.basename(value) !== 'aria.sh') return null;
    return exists(value) ? value : null;
}

export function setUpAria() {
    const link = new AriaLink(socketPath(), e => {
        for (const win of BrowserWindow.getAllWindows()) win.webContents.send('aria:event', e);
    });
    ipcMain.handle('aria:ask', (_e, text: unknown): Promise<AskResult> =>
        typeof text === 'string' && text.trim() ? link.ask(text) : Promise.resolve({ ok: false, error: 'not-running' }));
    ipcMain.handle('aria:status', () => link.status());
    let starting: Promise<{ ok: boolean; error?: 'no-launcher' | 'timeout' }> | null = null;
    ipcMain.handle('aria:start', () => {
        starting ??= (async () => {
            if (await link.status() === 'running') return { ok: true };
            let launcher: string | null = null;
            try {
                const db = await DB.getConnection();
                const row = await db.get(`SELECT value FROM app_state WHERE key = 'aria_launcher'`);
                launcher = launcherFrom(row?.value);
            } catch (err) {
                console.error('aria:start error:', err);
            }
            if (!launcher) return { ok: false, error: 'no-launcher' as const };
            try {
                spawn(launcher, [], { detached: true, stdio: 'ignore', cwd: path.dirname(launcher) }).unref();
            } catch (err) {
                console.error('aria:start error:', err);
                return { ok: false, error: 'no-launcher' as const };
            }
            for (let i = 0; i < START_WAIT_S; i++) {
                await new Promise(r => setTimeout(r, 1000));
                if (await link.status() === 'running') return { ok: true };
            }
            return { ok: false, error: 'timeout' as const };
        })().finally(() => { starting = null; });
        return starting;
    });
}
