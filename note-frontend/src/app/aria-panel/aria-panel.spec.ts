import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AriaPanel } from './aria-panel';
import { ModelService } from '../model.service';
import { AriaChat } from './aria-chat';
import { AriaEvent, TestCard, TestCards } from '../../services/NoteService';
import { Note } from '../../model/models';

describe('Aria panel', () => {
  let fixture: ComponentFixture<AriaPanel>;
  let panel: AriaPanel;
  let model: ModelService;
  let asked: string[];
  let studied: string[];
  let askResult: () => { ok: true; id: string } | { ok: false; error: 'not-running' };
  let startResult: { ok: boolean; error?: 'no-launcher' | 'timeout' };
  let push: (e: AriaEvent) => void;
  let status: 'running' | 'not-running';
  let before: unknown;
  let mapped: unknown[];
  let testCalls: number;
  let studiedTests: (string | undefined)[];
  let nextTests: TestCards | (() => Promise<TestCards>);

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
    studied = [];
    mapped = [];
    testCalls = 0;
    studiedTests = [];
    nextTests = { ok: true, cards: [], notebooks: [] };
    let n = 0;
    askResult = () => ({ ok: true, id: `r${++n}` });
    startResult = { ok: true };
    status = 'running';
    before = (window as any).electronAPI;
    (window as any).electronAPI = {
      aria: {
        ask: async (t: string) => { asked.push(t); return askResult(); },
        study: async (a: string, test?: string) => { studied.push(a); studiedTests.push(test); return askResult(); },
        tests: async (map?: unknown) => { testCalls++; mapped.push(map); return typeof nextTests === 'function' ? nextTests() : nextTests; },
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

  it('keeps the conversation, and a reply still being written, when the panel is closed and opened again', async () => {
    await say('clear my shopping list');
    push({ id: 'r1', type: 'text', delta: 'Should I ' });
    fixture.destroy();                                         // Esc / Ctrl+J: the panel is gone from the page
    push({ id: 'r1', type: 'text', delta: 'clear it?' });
    push({ id: 'r1', type: 'done', reply: 'Should I clear it?', tools: [], confirm: 'clear the shopping list' });
    fixture = TestBed.createComponent(AriaPanel);
    panel = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
    expect(panel.messages.map(m => m.text)).toEqual(['clear my shopping list', 'Should I clear it?']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.confirm button').length).toBe(2);
    key('ArrowUp');
    expect(panel.draft).toBe('clear my shopping list');     // ↑ still knows what was sent
  });

  it('keeps a half-typed message when the panel is closed and opened again', async () => {
    panel.draft = 'half a thought';
    fixture.destroy();
    fixture = TestBed.createComponent(AriaPanel);
    fixture.detectChanges();
    expect(fixture.componentInstance.draft).toBe('half a thought');
  });

  it('Escape closes the panel', () => {
    model.toggleAriaPanel();
    let open = false;
    model.ariaPanelOpen$.subscribe((v: boolean) => open = v);
    expect(open).toBeTrue();
    key('Escape');
    expect(open).toBeFalse();
  });

  describe('study buttons', () => {
    const openBio = async () => {
      model.onNoteClicked({ id: 3, title: 'Biology', content: '<p>x</p>', categoryID: 0, folderID: 0 } as Note);
      await settle();
    };
    const studyButtons = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.study button')) as HTMLButtonElement[];
    const labels = () => studyButtons().map(b => b.textContent?.trim());
    const click = async (label: string) => { studyButtons().find(b => b.textContent?.trim() === label)!.click(); await settle(); };

    it('hides the study buttons when no note is open', () => {
      expect(labels()).toEqual([]);
    });

    it('Quiz me sends the quiz study action and shows "Quiz me"', async () => {
      await openBio();
      expect(labels()).toEqual(['Quiz me', 'Explain simply', 'Test prep']);
      await click('Quiz me');
      expect(studied).toEqual(['quiz']);
      expect(asked).toEqual([]);
      expect(panel.messages.map(m => [m.role, m.text])).toEqual([['user', 'Quiz me'], ['aria', '']]);
    });

    it('Explain simply and Test prep send explain and prep', async () => {
      await openBio();
      await click('Explain simply');
      push({ id: 'r1', type: 'done', reply: 'Simple.', tools: [], confirm: null, quiz: false });
      await settle();
      await click('Test prep');
      expect(studied).toEqual(['explain', 'prep']);
    });

    it('a done with quiz true shows Hint, Skip and Stop, and they send hint, skip and stop', async () => {
      await openBio();
      await click('Quiz me');
      push({ id: 'r1', type: 'done', reply: 'Quiz on Biology. First one: ?', tools: ['start_quiz'], confirm: null, quiz: true });
      await settle();
      expect(labels()).toEqual(['Hint', 'Skip', 'Stop']);
      await click('Hint');
      push({ id: 'r2', type: 'done', reply: 'It starts with M.', tools: ['quiz'], confirm: null, quiz: true });
      await settle();
      await click('Skip');
      push({ id: 'r3', type: 'done', reply: 'Next: ?', tools: ['quiz'], confirm: null, quiz: true });
      await settle();
      await click('Stop');
      expect(asked).toEqual(['hint', 'skip', 'stop']);
    });

    it('a done with quiz false brings the study buttons back', async () => {
      await openBio();
      await click('Quiz me');
      push({ id: 'r1', type: 'done', reply: 'Quiz on Biology.', tools: ['start_quiz'], confirm: null, quiz: true });
      await settle();
      await click('Stop');
      push({ id: 'r2', type: 'done', reply: 'You got 0 of 1.', tools: ['quiz'], confirm: null, quiz: false });
      await settle();
      expect(labels()).toEqual(['Quiz me', 'Explain simply', 'Test prep']);
    });

    it('study buttons are disabled while a reply is pending', async () => {
      await openBio();
      await click('Explain simply');
      expect(studyButtons().every(b => b.disabled)).toBe(true);
    });

    it('retry resends a failed study action', async () => {
      await openBio();
      await click('Test prep');
      push({ id: 'r1', type: 'error', message: 'Aria stopped answering.' });
      await settle();
      await panel.retry(panel.messages[1]);
      await settle();
      expect(studied).toEqual(['prep', 'prep']);
      expect(asked).toEqual([]);
      expect(panel.messages.map(m => [m.role, m.text])).toEqual([['user', 'Test prep'], ['aria', '']]);
    });

    it('the empty panel points to the buttons when a note is open', async () => {
      expect(text()).toContain('Ask about this note, your lists or your calendar.');
      await openBio();
      expect(text()).toContain('Ask about this note, or use the buttons below to study it.');
    });
  });

  describe('test cards', () => {
    const chat = () => TestBed.inject(AriaChat);
    const el = () => fixture.nativeElement as HTMLElement;
    const card = (over: Partial<TestCard> = {}): TestCard => ({
      id: 'dbi-1', subject: 'DBI', headline: 'DBI test on Tuesday · in 5 days', topic: 'Normalformen', days: 5,
      notebook: { id: 12, name: 'Databases' }, notes: 3, ...over });
    const show = async (cards: TestCard[], notebooks = [{ id: 12, name: 'Databases' }, { id: 13, name: 'Maths' }]) => {
      nextTests = { ok: true, cards, notebooks };
      await chat().loadTests();
      await settle();
    };
    const cardButtons = () => Array.from(el().querySelectorAll('.test-card button')) as HTMLButtonElement[];

    it('shows a card with headline, notebook line and Quiz me, with no note open', async () => {
      await show([card()]);
      expect(text()).toContain('DBI test on Tuesday · in 5 days');
      expect(text()).toContain('Normalformen · Databases · 3 notes');
      expect(cardButtons().map(b => b.textContent?.trim())).toEqual(['Quiz me']);
      expect(el().querySelector('.study')).toBeNull();
    });

    it('says "1 note" for one note', async () => {
      await show([card({ notes: 1 })]);
      expect(text()).toContain('Normalformen · Databases · 1 note');
      expect(text()).not.toContain('1 notes');
    });

    it('Quiz me on a card sends study(\'test\', id) and shows "Quiz me for my DBI test"', async () => {
      await show([card()]);
      cardButtons()[0].click();
      await settle();
      expect(studied).toEqual(['test']);
      expect(studiedTests).toEqual(['dbi-1']);
      expect(panel.messages.map(m => [m.role, m.text])).toEqual([['user', 'Quiz me for my DBI test'], ['aria', '']]);
      expect(cardButtons().every(b => b.disabled)).toBeTrue();
    });

    it('an unmapped card asks which notebook and saves the choice', async () => {
      await show([card({ notebook: null, notes: 0, topic: '' })]);
      expect(text()).toContain('Which notebook is DBI?');
      const select = el().querySelector('select') as HTMLSelectElement;
      const label = el().querySelector('label') as HTMLLabelElement;
      expect(label.htmlFor).toBe(select.id);
      expect(Array.from(select.options).map(o => o.textContent?.trim())).toEqual(['Choose…', 'Databases', 'Maths']);
      nextTests = { ok: true, cards: [card()], notebooks: [{ id: 12, name: 'Databases' }] };
      select.value = '12';
      select.dispatchEvent(new Event('change'));
      await settle();
      expect(mapped[mapped.length - 1]).toEqual({ subject: 'DBI', notebook: 12 });
      expect(el().querySelector('select')).toBeNull();
      expect(text()).toContain('Normalformen · Databases · 3 notes');
    });

    it('an unmapped card with no notebooks says to make one', async () => {
      await show([card({ notebook: null, notes: 0 })], []);
      expect(text()).toContain('Make a notebook for it first.');
      expect(el().querySelector('select')).toBeNull();
      expect(cardButtons()).toEqual([]);
    });

    it('a card with no usable notes has no button', async () => {
      await show([card({ notes: 0 })]);
      expect(text()).toContain('Databases · no notes with enough text yet');
      expect(cardButtons()).toEqual([]);
    });

    it('cards are hidden while a quiz runs and reloaded when it ends', async () => {
      await show([card()]);
      cardButtons()[0].click();
      await settle();
      push({ id: 'r1', type: 'done', reply: 'Quiz on DBI.', tools: ['start_quiz'], confirm: null, quiz: true });
      await settle();
      expect(el().querySelector('.test-card')).toBeNull();
      const before = testCalls;
      push({ id: 'r1', type: 'done', reply: 'x', tools: [], confirm: null, quiz: true });
      await panel.quizButton('stop');
      push({ id: 'r2', type: 'done', reply: 'You got 3 of 8.', tools: ['quiz'], confirm: null, quiz: false });
      await settle();
      expect(testCalls).toBe(before + 1);
      expect(el().querySelector('.test-card')).not.toBeNull();
    });

    it('a failed load keeps the cards that were there', async () => {
      await show([card()]);
      nextTests = { ok: false, cards: [], notebooks: [] };
      await chat().loadTests();
      await settle();
      expect(text()).toContain('DBI test on Tuesday');
    });

    it('no cards and no error when tests() is missing or throws', async () => {
      delete (window as any).electronAPI.aria.tests;
      await chat().loadTests();
      (window as any).electronAPI.aria.tests = async () => { throw new Error('old'); };
      await chat().loadTests();
      await chat().mapTest('DBI', 12);
      await settle();
      expect(chat().tests).toEqual([]);
      expect(el().querySelector('.test-card')).toBeNull();
    });

    it('keeps the cards that were there when tests() later throws or goes missing', async () => {
      await show([card()]);
      (window as any).electronAPI.aria.tests = async () => { throw new Error('gone'); };
      await chat().loadTests();
      await chat().mapTest('DBI', 12);
      await settle();
      expect(text()).toContain('DBI test on Tuesday');
      delete (window as any).electronAPI.aria.tests;
      await chat().loadTests();
      await settle();
      expect(text()).toContain('DBI test on Tuesday');
      expect(chat().notebooks.length).toBe(2);
    });

    it('opening the panel loads the cards without a manual loadTests', async () => {
      nextTests = { ok: true, cards: [card()], notebooks: [] };
      const before = testCalls;
      const opened = TestBed.createComponent(AriaPanel);
      opened.detectChanges();
      await opened.whenStable();
      opened.detectChanges();
      expect(testCalls).toBeGreaterThan(before);
      expect(opened.nativeElement.textContent).toContain('DBI test on Tuesday');
    });

    it('with no note open, a running test quiz still shows Hint, Skip and Stop', async () => {
      await show([card()]);
      cardButtons()[0].click();
      await settle();
      push({ id: 'r1', type: 'done', reply: 'Quiz on DBI.', tools: ['start_quiz'], confirm: null, quiz: true });
      await settle();
      expect(panel.noteTitle).toBeFalsy();
      const labels = Array.from(el().querySelectorAll('.study button')).map(b => b.textContent?.trim());
      expect(labels).toEqual(['Hint', 'Skip', 'Stop']);
    });

    it('with no note open and no quiz there are no study buttons', async () => {
      await show([card()]);
      expect(el().querySelector('.study')).toBeNull();
    });

    it('pressing Start loads the cards', async () => {
      panel.running = false;
      nextTests = { ok: true, cards: [card()], notebooks: [] };
      const before = testCalls;
      await panel.startAria();
      await settle();
      expect(testCalls).toBeGreaterThan(before);
      expect(text()).toContain('DBI test on Tuesday');
    });

    it('the notebook choice is disabled while Aria is answering', async () => {
      await show([card({ notebook: null, notes: 0 })]);
      const select = () => el().querySelector('.test-card select') as HTMLSelectElement;
      expect(select().disabled).toBeFalse();
      await say('hello');
      expect(select().disabled).toBeTrue();
    });

    it('retry resends the same test', async () => {
      await show([card()]);
      cardButtons()[0].click();
      await settle();
      push({ id: 'r1', type: 'error', message: 'Aria stopped answering.' });
      await settle();
      await panel.retry(panel.messages[1]);
      await settle();
      expect(studied).toEqual(['test', 'test']);
      expect(studiedTests).toEqual(['dbi-1', 'dbi-1']);
      expect(panel.messages.map(m => [m.role, m.text])).toEqual([['user', 'Quiz me for my DBI test'], ['aria', '']]);
    });
  });
});
