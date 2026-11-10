/** Talking to Aria from inside MyNotion (the Aria panel).
 *
 *  Aria listens on a private Unix socket (BetterAI/ui/app_bridge.py). One JSON object per line, both ways:
 *    →  {"id","type":"chat","text"}   |  {"id","type":"status"}
 *    →  {"id","type":"edit","action","html",…}   her version of a selection; answered with {"id","type":"proposal","html"}
 *    →  {"id","type":"study","action":"quiz|explain|prep"}   a study button, on the open note; answered like chat
 *    ←  {"id","type":"text","delta"}  |  {"id","type":"done","reply","tools","confirm","quiz"}  |  {"id","type":"error","message"}
 *  "done" carries her final reply (it replaces what was streamed), a yes/no question that is waiting, and whether a
 *  quiz is running now (the panel then shows Hint, Skip and Stop).
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
    | { type: 'done'; reply: string; tools: string[]; confirm: string | null; quiz: boolean }
    | { type: 'proposal'; html: string }
    | { type: 'error'; message: string });
/** "Select text, ask Aria": the selection and what to do with it. */
export type EditRequest = {
    action: 'rewrite' | 'shorter' | 'spelling' | 'table' | 'custom';
    html: string; instruction: string; title: string; context: string; previous: string;
};
/** The Aria panel's study buttons: Quiz me, Explain simply, Test prep. */
export type StudyAction = 'quiz' | 'explain' | 'prep';
export const STUDY_ACTIONS: readonly StudyAction[] = ['quiz', 'explain', 'prep'];
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

/** Is this Aria's socket, and ours? Normally it's in our private runtime folder; if that isn't set it falls
 *  back to /tmp, where anyone could put a socket with that name and read what we send. */
export function isOurSocket(st: { uid: number; isSocket(): boolean } | null, uid: number = process.getuid?.() ?? 0): boolean {
    return !!st && st.isSocket() && st.uid === uid;
}

const ours = (file: string): boolean => {
    try { return isOurSocket(fs.statSync(file)); } catch { return false; }
};

export class AriaLink {
    private sock: net.Socket | null = null;
    private connecting: Promise<net.Socket | null> | null = null;
    private open = new Set<string>();                               // chat requests still being answered
    private waiting = new Map<string, (running: boolean) => void>(); // status requests

    constructor(private file: string, private emit: (e: AriaEvent) => void,
                private trusted: (file: string) => boolean = ours) {}

    private connect(): Promise<net.Socket | null> {
        if (this.sock) return Promise.resolve(this.sock);
        if (this.connecting) return this.connecting;
        if (!this.trusted(this.file)) return Promise.resolve(null);
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
                quiz: e.quiz === true,
            });
        } else if (e.type === 'proposal' && typeof e.html === 'string' && e.html) {
            this.open.delete(e.id);
            this.emit({ id: e.id, type: 'proposal', html: e.html });
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

    /** tools === false: an answer only; she can't change or do anything for this message ("Explain"). */
    ask(text: string, tools = true): Promise<AskResult> {
        return this.request(tools ? { type: 'chat', text } : { type: 'chat', text, tools: false });
    }

    /** Her version of a selection: answered with one 'proposal' (or an 'error' saying why there is none). */
    edit(r: EditRequest): Promise<AskResult> {
        return this.request({ type: 'edit', action: r.action, html: r.html, instruction: r.instruction,
                              title: r.title, context: r.context, previous: r.previous });
    }

    /** A study button on the open note: answered like a chat message. */
    study(action: StudyAction): Promise<AskResult> {
        return this.request({ type: 'study', action });
    }

    private async request(body: Record<string, unknown>): Promise<AskResult> {
        const sock = await this.connect();
        if (!sock) return { ok: false, error: 'not-running' };
        const id = randomUUID();
        this.open.add(id);
        if (!this.write(sock, { id, ...body })) {
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
    ipcMain.handle('aria:ask', (_e, text: unknown, tools: unknown): Promise<AskResult> =>
        typeof text === 'string' && text.trim() ? link.ask(text, tools !== false) : Promise.resolve({ ok: false, error: 'not-running' }));
    const text = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';
    ipcMain.handle('aria:edit', (_e, r: Partial<EditRequest> | null): Promise<AskResult> => {
        const actions = ['rewrite', 'shorter', 'spelling', 'table', 'custom'];
        if (!r || !actions.includes(r.action as string) || typeof r.html !== 'string' || !r.html.trim())
            return Promise.resolve({ ok: false, error: 'not-running' });
        return link.edit({ action: r.action as EditRequest['action'], html: r.html, instruction: text(r.instruction, 500),
                           title: text(r.title, 200), context: text(r.context, 2000), previous: text(r.previous, 40000) });
    });
    ipcMain.handle('aria:study', (_e, action: unknown): Promise<AskResult> =>
        STUDY_ACTIONS.includes(action as StudyAction) ? link.study(action as StudyAction) : Promise.resolve({ ok: false, error: 'not-running' }));
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
