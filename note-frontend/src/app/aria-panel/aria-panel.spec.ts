import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AriaPanel } from './aria-panel';
import { ModelService } from '../model.service';
import { AriaEvent } from '../../services/NoteService';
import { Note } from '../../model/models';

describe('Aria panel', () => {
  let fixture: ComponentFixture<AriaPanel>;
  let panel: AriaPanel;
  let model: ModelService;
  let asked: string[];
  let askResult: () => { ok: true; id: string } | { ok: false; error: 'not-running' };
  let startResult: { ok: boolean; error?: 'no-launcher' | 'timeout' };
  let push: (e: AriaEvent) => void;
  let status: 'running' | 'not-running';
  let before: unknown;

  const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const say = async (draft: string) => { panel.draft = draft; await panel.send(); await settle(); };
  const key = (k: string, extra: Partial<KeyboardEvent> = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, cancelable: true, ...extra });
    panel.onKey(e);
    return e;
  };

  beforeEach(async () => {
    asked = [];
    let n = 0;
    askResult = () => ({ ok: true, id: `r${++n}` });
    startResult = { ok: true };
    status = 'running';
    before = (window as any).electronAPI;
    (window as any).electronAPI = {
      aria: {
        ask: async (t: string) => { asked.push(t); return askResult(); },
        status: async () => status,
        start: async () => startResult,
        onEvent: (cb: (e: AriaEvent) => void) => { push = cb; return () => { push = () => undefined; }; },
      },
    };
    await TestBed.configureTestingModule({ imports: [AriaPanel] }).compileComponents();
    model = TestBed.inject(ModelService);
    fixture = TestBed.createComponent(AriaPanel);
    panel = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
  });
  afterEach(() => { (window as any).electronAPI = before; });

  it('shows the user message and a pending reply after send', async () => {
    await say('hello');
    expect(asked).toEqual(['hello']);
    expect(panel.messages.map(m => [m.role, m.text, !!m.pending])).toEqual([['user', 'hello', false], ['aria', '', true]]);
    expect(panel.draft).toBe('');
  });

  it('appends streamed text to the pending reply', async () => {
    await say('hello');
    push({ id: 'r1', type: 'text', delta: 'Hi ' });
    push({ id: 'r1', type: 'text', delta: 'there' });
    await settle();
    expect(panel.messages[1].text).toBe('Hi there');
    expect(text()).toContain('Hi there');
  });

  it('replaces the streamed draft with the final reply', async () => {
    await say('hello');
    push({ id: 'r1', type: 'text', delta: 'Hi there! Let me know if you need anything else.' });
    push({ id: 'r1', type: 'done', reply: 'Hi there!', tools: [], confirm: null });
    await settle();
    expect(panel.messages[1].text).toBe('Hi there!');
    expect(panel.messages[1].pending).toBeFalse();
  });

  it('keeps the streamed text when the final reply is empty', async () => {
    await say('hello');
    push({ id: 'r1', type: 'text', delta: 'Hi' });
    push({ id: 'r1', type: 'done', reply: '', tools: [], confirm: null });
    expect(panel.messages[1].text).toBe('Hi');
  });

  it('ignores events for other ids', async () => {
    await say('hello');
    push({ id: 'someone-else', type: 'text', delta: 'nope' });
    push({ id: 'someone-else', type: 'done', reply: 'nope', tools: [], confirm: null });
    expect(panel.messages[1].text).toBe('');
    expect(panel.messages[1].pending).toBeTrue();
  });

  it('does not lose text that arrives before the request id is known', async () => {
    let release!: (r: { ok: true; id: string }) => void;
    (window as any).electronAPI.aria.ask = (t: string) => { asked.push(t); return new Promise(r => release = r); };
    panel.draft = 'hello';
    const sending = panel.send();
    push({ id: 'early', type: 'text', delta: 'Hi' });
    release({ ok: true, id: 'early' });
    await sending;
    expect(panel.messages[1].text).toBe('Hi');
  });

  it('does not send while a reply is pending', async () => {
    panel.draft = 'one';
    const first = panel.send();
    panel.draft = 'two';
    await panel.send();
    await first;
    expect(asked).toEqual(['one']);
    expect(panel.draft).toBe('two');                       // what was typed meanwhile is kept
  });

  it('does not send an empty or whitespace message', async () => {
    await say('   \n ');
    expect(asked).toEqual([]);
    expect(panel.messages).toEqual([]);
  });

  it('Enter sends, Shift+Enter does not', async () => {
    panel.draft = 'hello';
    expect(key('Enter', { shiftKey: true }).defaultPrevented).toBeFalse();
    expect(asked).toEqual([]);
    expect(key('Enter').defaultPrevented).toBeTrue();
    await settle();
    expect(asked).toEqual(['hello']);
  });

  it('shows Yes and No when a question is pending and sends the answer', async () => {
    await say('clear my shopping list');
    push({ id: 'r1', type: 'done', reply: 'Should I clear it?', tools: ['clear_list'], confirm: 'clear the shopping list' });
    await settle();
    const buttons = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.confirm button')).map(b => b.textContent?.trim());
    expect(buttons()).toEqual(['Yes', 'No']);
    await panel.answer('yes');
    await settle();
    expect(asked).toEqual(['clear my shopping list', 'yes']);
    expect(buttons()).toEqual([]);
  });

  it('marks a reply failed on an error event and keeps the partial text', async () => {
    await say('hello');
    push({ id: 'r1', type: 'text', delta: 'I was sa' });
    push({ id: 'r1', type: 'error', message: 'Aria stopped answering.' });
    await settle();
    const m = panel.messages[1];
    expect([m.text, m.failed, !!m.pending]).toEqual(['I was sa', true, false]);
    expect(text()).toContain('Aria stopped answering.');
    expect(text()).toContain('Retry');
  });

  it('retry resends the same question', async () => {
    await say('hello');
    push({ id: 'r1', type: 'error', message: 'Aria stopped answering.' });
    await panel.retry(panel.messages[1]);
    await settle();
    expect(asked).toEqual(['hello', 'hello']);
    expect(panel.messages.map(m => [m.role, m.text, !!m.pending])).toEqual([['user', 'hello', false], ['aria', '', true]]);
  });

  it('shows "Aria isn\'t running" when ask says not-running, and keeps what was typed', async () => {
    askResult = () => ({ ok: false, error: 'not-running' });
    await say('hello');
    expect(panel.running).toBeFalse();
    expect(panel.messages).toEqual([]);
    expect(panel.draft).toBe('hello');
    expect(text()).toContain("Aria isn't running");
  });

  it('says so right away when Aria is not running', async () => {
    status = 'not-running';
    fixture = TestBed.createComponent(AriaPanel);
    fixture.detectChanges();
    await settle();
    expect(fixture.componentInstance.running).toBeFalse();
    expect(text()).toContain("Aria isn't running");
  });

  it('start makes the panel usable again', async () => {
    askResult = () => ({ ok: false, error: 'not-running' });
    await say('hello');
    await panel.startAria();
    await settle();
    expect(panel.running).toBeTrue();
    expect(text()).not.toContain("Aria isn't running");
  });

  it('explains when Aria cannot be started', async () => {
    panel.running = false;
    startResult = { ok: false, error: 'no-launcher' };
    await panel.startAria();
    await settle();
    expect(text()).toContain('Start Aria once from the menu, then try again.');
    startResult = { ok: false, error: 'timeout' };
    await panel.startAria();
    await settle();
    expect(text()).toContain("Aria didn't start. Check ~/.cache/aria/aria.log.");
  });

  it('ArrowUp brings back the last message, ArrowDown goes forward', async () => {
    await say('first');
    push({ id: 'r1', type: 'done', reply: 'ok', tools: [], confirm: null });
    await say('second');
    key('ArrowUp');
    expect(panel.draft).toBe('second');
    key('ArrowUp');
    expect(panel.draft).toBe('first');
    key('ArrowDown');
    expect(panel.draft).toBe('second');
    key('ArrowDown');
    expect(panel.draft).toBe('');
  });

  it('ArrowUp leaves a message being typed alone', () => {
    panel.draft = 'half a thought';
    expect(key('ArrowUp').defaultPrevented).toBeFalse();
    expect(panel.draft).toBe('half a thought');
  });

  it('shows the open note as a chip', async () => {
    model.onNoteClicked({ id: 3, title: 'Biology', content: '', categoryID: 0, folderID: 0 } as Note);
    await settle();
    expect(text()).toContain('This note: Biology');
    model.showInbox();
    await settle();
    expect(text()).not.toContain('This note');
  });

  it('shows a reply as text, never as HTML', async () => {
    await say('hello');
    push({ id: 'r1', type: 'done', reply: '<img src=x onerror=alert(1)> <b>bold</b>', tools: [], confirm: null });
    await settle();
    expect((fixture.nativeElement as HTMLElement).querySelector('.message img, .message b')).toBeNull();
    expect(text()).toContain('<b>bold</b>');
  });

  it('a long conversation scrolls instead of squashing the messages', async () => {
    const host = fixture.nativeElement as HTMLElement;
    host.style.height = '300px';
    document.body.appendChild(host);
    for (let i = 0; i < 30; i++) panel.messages.push({ role: i % 2 ? 'aria' : 'user', text: `message ${i}` });
    fixture.detectChanges();
    const list = host.querySelector('.list') as HTMLElement;
    const heights = Array.from(host.querySelectorAll<HTMLElement>('.message')).map(m => m.offsetHeight);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(18);       // a full line of text each
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    host.remove();
  });

  it('Escape closes the panel', () => {
    model.toggleAriaPanel();
    let open = false;
    model.ariaPanelOpen$.subscribe((v: boolean) => open = v);
    expect(open).toBeTrue();
    key('Escape');
    expect(open).toBeFalse();
  });
});
