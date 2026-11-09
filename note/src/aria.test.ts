import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: {}, BrowserWindow: {}, app: { getPath: () => '/tmp' } }));
vi.mock('./database/database', () => ({ DB: {} }));
import { AriaEvent, AriaLink, launcherFrom, socketPath, splitLines } from './aria';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-link-'));
let n = 0;
const servers: net.Server[] = [];
const links: AriaLink[] = [];

/** A stand-in for Aria: `onRequest` gets each request and the socket to answer on. */
function fakeAria(onRequest: (req: any, sock: net.Socket) => void): Promise<string> {
    const file = path.join(dir, `s${n++}.sock`);
    const server = net.createServer(sock => {
        let buf = '';
        sock.on('data', d => {
            buf += d.toString();
            let i: number;
            while ((i = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, i);
                buf = buf.slice(i + 1);
                onRequest(JSON.parse(line), sock);
            }
        });
        sock.on('error', () => { /* the test closed it */ });
    });
    servers.push(server);
    return new Promise(resolve => server.listen(file, () => resolve(file)));
}
const line = (o: unknown) => JSON.stringify(o) + '\n';
const status = (req: any, sock: net.Socket) => {
    if (req.type === 'status') sock.write(line({ id: req.id, type: 'status', ready: true }));
};
function link(file: string, events: AriaEvent[] = []) {
    const l = new AriaLink(file, e => events.push(e));
    links.push(l);
    return l;
}
const until = async (ok: () => boolean) => {
    for (let i = 0; i < 200 && !ok(); i++) await new Promise(r => setTimeout(r, 10));
    expect(ok()).toBe(true);
};

afterEach(() => {
    links.splice(0).forEach(l => l.close());
    servers.splice(0).forEach(s => s.close());
});

describe('where Aria listens', () => {
    it('builds the same socket path as Aria', () => {
        expect(socketPath({ XDG_RUNTIME_DIR: '/run/user/1000' }, 1000)).toBe('/run/user/1000/aria-1000-app.sock');
    });
    it('falls back to /tmp', () => {
        expect(socketPath({}, 7)).toBe('/tmp/aria-7-app.sock');
    });
});

describe('reading her answers', () => {
    it('joins an event split across chunks', () => {
        const a = splitLines(Buffer.alloc(0), Buffer.from('{"id":"1","ty'));
        expect(a.lines).toEqual([]);
        const b = splitLines(a.rest, Buffer.from('pe":"text","delta":"a"}\n'));
        expect(b.lines).toEqual(['{"id":"1","type":"text","delta":"a"}']);
        expect(b.rest.length).toBe(0);
    });
    it('splits several events in one chunk', () => {
        const r = splitLines(Buffer.alloc(0), Buffer.from('one\ntwo\nthr'));
        expect(r.lines).toEqual(['one', 'two']);
        expect(r.rest.toString()).toBe('thr');
    });
    it('keeps a multi-byte character split across chunks intact', () => {
        const all = Buffer.from('Größe 😀\n');
        const cut = all.indexOf(Buffer.from('ö')) + 1;        // inside the two-byte ö
        const a = splitLines(Buffer.alloc(0), all.subarray(0, cut));
        expect(a.lines).toEqual([]);
        expect(splitLines(a.rest, all.subarray(cut)).lines).toEqual(['Größe 😀']);
    });
});

describe('talking to Aria', () => {
    it('says not-running when nobody listens', async () => {
        const l = link(path.join(dir, 'nobody.sock'));
        expect(await l.status()).toBe('not-running');
        expect(await l.ask('hello')).toEqual({ ok: false, error: 'not-running' });
    });

    it('says not-running for a stale socket file', async () => {
        const file = path.join(dir, 'stale.sock');
        const s = net.createServer();
        await new Promise<void>(r => s.listen(file, r));
        await new Promise(r => s.close(r));
        fs.writeFileSync(file, '');                           // a closed server removes its file: leave one behind
        expect(await link(file).status()).toBe('not-running');
    });

    it('says running when Aria answers', async () => {
        expect(await link(await fakeAria(status)).status()).toBe('running');
    });

    it('relays text and done events for a request', async () => {
        const got: any[] = [];
        const file = await fakeAria((req, sock) => {
            got.push(req);
            sock.write(line({ id: req.id, type: 'text', delta: 'Schön ' }));
            sock.write(line({ id: req.id, type: 'done', reply: 'Schön.', tools: ['add_note'], confirm: null }));
        });
        const events: AriaEvent[] = [];
        const r = await link(file, events).ask('  hallo Größe  ');
        expect(r.ok).toBe(true);
        const id = (r as { id: string }).id;
        await until(() => events.length === 2);
        expect(got).toEqual([{ id, type: 'chat', text: '  hallo Größe  ' }]);
        expect(events).toEqual([
            { id, type: 'text', delta: 'Schön ' },
            { id, type: 'done', reply: 'Schön.', tools: ['add_note'], confirm: null },
        ]);
    });

    it('gives every request its own id', async () => {
        const file = await fakeAria((req, sock) => sock.write(line({ id: req.id, type: 'done', reply: '', tools: [], confirm: null })));
        const l = link(file);
        const a = await l.ask('one'), b = await l.ask('two');
        expect(a.ok && b.ok && a.id !== b.id).toBe(true);
    });

    it('emits "Aria stopped answering." when the connection closes mid-request', async () => {
        const file = await fakeAria((req, sock) => {
            sock.write(line({ id: req.id, type: 'text', delta: 'I was sa' }));
            sock.destroy();
        });
        const events: AriaEvent[] = [];
        const r = await link(file, events).ask('hello');
        const id = (r as { id: string }).id;
        await until(() => events.some(e => e.type === 'error'));
        expect(events[events.length - 1]).toEqual({ id, type: 'error', message: 'Aria stopped answering.' });
    });

    it('does not report a finished request when the connection closes later', async () => {
        let sockRef: net.Socket | null = null;
        const file = await fakeAria((req, sock) => {
            sockRef = sock;
            sock.write(line({ id: req.id, type: 'done', reply: 'ok', tools: [], confirm: null }));
        });
        const events: AriaEvent[] = [];
        await link(file, events).ask('hello');
        await until(() => events.length === 1);
        sockRef!.destroy();
        await new Promise(r => setTimeout(r, 50));
        expect(events.map(e => e.type)).toEqual(['done']);
    });

    it('reconnects on the next request after a drop', async () => {
        let first = true;
        const file = await fakeAria((req, sock) => {
            if (first) { first = false; sock.destroy(); return; }
            sock.write(line({ id: req.id, type: 'done', reply: 'back', tools: [], confirm: null }));
        });
        const events: AriaEvent[] = [];
        const l = link(file, events);
        await l.ask('one');
        await until(() => events.some(e => e.type === 'error'));
        const r = await l.ask('two');
        expect(r.ok).toBe(true);
        await until(() => events.some(e => e.type === 'done'));
    });

    it('says running while she is busy answering, even though status has to wait', async () => {
        // Aria answers one request at a time per connection: during a turn a status request gets no answer yet
        const file = await fakeAria((req, sock) => {
            if (req.type === 'chat') sock.write(line({ id: req.id, type: 'text', delta: 'thinking…' }));
        });
        const l = link(file);
        await l.ask('a long question');
        const t0 = Date.now();
        expect(await l.status()).toBe('running');
        expect(Date.now() - t0).toBeLessThan(500);
    });

    it('ignores a line that is not an event', async () => {
        const file = await fakeAria((req, sock) => {
            sock.write('garbage\n');
            sock.write(line({ id: req.id, type: 'done', reply: 'ok', tools: [], confirm: null }));
        });
        const events: AriaEvent[] = [];
        await link(file, events).ask('hello');
        await until(() => events.length === 1);
        expect(events[0].type).toBe('done');
    });
});

describe('starting Aria', () => {
    const there = () => true;
    it('starts the launcher Aria wrote down', () => {
        expect(launcherFrom('/home/me/BetterAI/aria.sh', there)).toBe('/home/me/BetterAI/aria.sh');
    });
    it('never starts anything else', () => {
        expect(launcherFrom('/usr/bin/rm', there)).toBeNull();
        expect(launcherFrom('aria.sh', there)).toBeNull();              // not a full path
        expect(launcherFrom('/home/me/aria.sh --quit', there)).toBeNull();
        expect(launcherFrom(null, there)).toBeNull();
        expect(launcherFrom(12, there)).toBeNull();
    });
    it('not when the file is gone', () => {
        expect(launcherFrom('/home/me/BetterAI/aria.sh', () => false)).toBeNull();
    });
});
