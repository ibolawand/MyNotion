import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { AriaEdit } from './aria-edit';
import { AriaRange, ariaRange } from '../aria-range';
import { ModelService } from '../../model.service';
import { AriaEditRequest, AriaEvent } from '../../../services/NoteService';

describe('Select text, ask Aria', () => {
  let fixture: ComponentFixture<AriaEdit>;
  let card: AriaEdit;
  let editor: Editor;
  let holder: HTMLElement;
  let edits: AriaEditRequest[];
  let asked: string[];
  let listeners: ((e: AriaEvent) => void)[];
  let editResult: () => { ok: true; id: string } | { ok: false; error: 'not-running' };
  let before: unknown;

  const push = (e: AriaEvent) => listeners.slice().forEach(l => l(e));
  const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const select = (from: number, to: number) => editor.commands.setTextSelection({ from, to });
  const start = async (action: AriaEditRequest['action'], instruction = '') => { card.openMenu(); await card.run(action, instruction); await settle(); };

  beforeEach(async () => {
    edits = []; asked = []; listeners = [];
    let n = 0;
    editResult = () => ({ ok: true, id: `e${++n}` });
    before = (window as any).electronAPI;
    (window as any).electronAPI = { aria: {
      edit: async (r: AriaEditRequest) => { edits.push(r); return editResult(); },
      ask: async (t: string) => { asked.push(t); return { ok: true, id: 'chat1' }; },
      status: async () => 'running',
      start: async () => ({ ok: true }),
      onEvent: (cb: (e: AriaEvent) => void) => { listeners.push(cb); return () => { listeners = listeners.filter(l => l !== cb); }; },
    } };
    holder = document.createElement('div');
    document.body.appendChild(holder);
    editor = new Editor({ element: holder, extensions: [StarterKit, AriaRange],
      content: '<p>The mitochondria is the the powerhouse.</p><ul><li><p>first item</p></li><li><p>second item</p></li></ul>' });
    await TestBed.configureTestingModule({ imports: [AriaEdit] }).compileComponents();
    fixture = TestBed.createComponent(AriaEdit);
    card = fixture.componentInstance;
    fixture.componentRef.setInput('editor', editor);
    fixture.componentRef.setInput('title', 'Biology');
    fixture.componentRef.setInput('noteId', 3);
    fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); editor.destroy(); holder.remove(); (window as any).electronAPI = before; });

  it('is not there until asked for, and not for an empty selection', async () => {
    expect(card.state).toBe('closed');
    select(3, 3);
    card.openMenu();
    expect(card.state).toBe('closed');
  });

  it('opens a menu with the actions and marks the selection', async () => {
    select(5, 17);
    card.openMenu();
    await settle();
    expect(card.state).toBe('menu');
    const labels = Array.from(el().querySelectorAll('.actions button')).map(b => b.textContent?.trim());
    expect(labels).toEqual(['Rewrite', 'Shorter', 'Fix spelling', 'Make a table', 'Explain']);
    expect(ariaRange(editor.state)).toEqual({ from: 5, to: 17 });
  });

  it('sends the selection with the note title and the text around it', async () => {
    select(5, 17);
    await start('shorter');
    expect(card.state).toBe('writing');
    expect(edits).toEqual([{ action: 'shorter', html: 'mitochondria', instruction: '', title: 'Biology',
      context: jasmine.stringContaining('The mitochondria is the the powerhouse.') as any, previous: '' }]);
    expect(text()).toContain('Aria is writing');
  });

  it('shows her version and puts it in on Accept, undoable', async () => {
    select(1, 40);
    await start('spelling');
    push({ id: 'e1', type: 'proposal', html: '<p>The mitochondria is the powerhouse.</p>' });
    await settle();
    expect(card.state).toBe('proposal');
    expect(el().querySelector('.preview')?.textContent).toContain('The mitochondria is the powerhouse.');
    expect(editor.getText()).toContain('the the');                     // nothing changed yet
    card.accept();
    await settle();
    expect(card.state).toBe('closed');
    expect(editor.getHTML()).toContain('<p>The mitochondria is the powerhouse.</p><ul>');
    expect(ariaRange(editor.state)).toBeNull();
    editor.commands.undo();
    expect(editor.getText()).toContain('the the');
  });

  it('changes only the selected words inside a line', async () => {
    select(5, 17);
    await start('rewrite');
    push({ id: 'e1', type: 'proposal', html: '<p><strong>Mitochondria</strong></p>' });
    await settle();
    card.accept();
    expect(editor.getHTML()).toContain('<p>The <strong>Mitochondria</strong> is the the powerhouse.</p>');
  });

  it('changes one list item without breaking the list', async () => {
    const at = editor.getText().length;                              // find "first item" by position
    let from = 0;
    editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === 'first item') from = pos; });
    void at;
    select(from, from + 'first item'.length);
    await start('rewrite');
    push({ id: 'e1', type: 'proposal', html: '<p>item one</p>' });
    await settle();
    card.accept();
    expect(editor.getHTML()).toContain('<ul><li><p>item one</p></li><li><p>second item</p></li></ul>');
  });

  it('Reject leaves the note alone', async () => {
    select(1, 40);
    await start('shorter');
    push({ id: 'e1', type: 'proposal', html: '<p>Short.</p>' });
    await settle();
    const html = editor.getHTML();
    card.reject();
    expect(card.state).toBe('closed');
    expect(editor.getHTML()).toBe(html);
    expect(ariaRange(editor.state)).toBeNull();
  });

  it('Try again asks for a different version of the same text', async () => {
    select(1, 40);
    await start('shorter');
    push({ id: 'e1', type: 'proposal', html: '<p>Short.</p>' });
    await settle();
    await card.tryAgain();
    expect(card.state).toBe('writing');
    expect(edits[1]).toEqual({ ...edits[0], previous: '<p>Short.</p>' });
    push({ id: 'e2', type: 'proposal', html: '<p>Brief.</p>' });
    await settle();
    expect(el().querySelector('.preview')?.textContent).toContain('Brief.');
  });

  it('steering redoes the same text with the extra instruction', async () => {
    select(1, 40);
    await start('custom', 'make it formal');
    push({ id: 'e1', type: 'proposal', html: '<p>Formal.</p>' });
    await settle();
    card.steerText = 'keep "powerhouse"';
    await card.steer();
    expect(edits[1].action).toBe('custom');
    expect(edits[1].instruction).toBe('make it formal. keep "powerhouse"');
    expect(edits[1].html).toBe(edits[0].html);
    select(1, 40);
    card.reject();
    await start('shorter');
    push({ id: 'e3', type: 'proposal', html: '<p>Short.</p>' });
    await settle();
    card.steerText = 'keep the numbers';
    await card.steer();
    expect([edits[3].action, edits[3].instruction]).toEqual(['shorter', 'keep the numbers']);
  });

  it('an own instruction is sent as typed, and an empty one is not sent', async () => {
    select(1, 40);
    card.openMenu();
    card.instruction = '   ';
    await card.runOwn();
    expect(edits).toEqual([]);
    card.instruction = ' turn into bullet points ';
    await card.runOwn();
    expect([edits[0].action, edits[0].instruction]).toEqual(['custom', 'turn into bullet points']);
  });

  it('says why when she has no version, with Try again', async () => {
    select(1, 40);
    await start('spelling');
    push({ id: 'e1', type: 'error', message: 'I found no mistakes in that part.' });
    await settle();
    expect(card.state).toBe('message');
    expect(text()).toContain('I found no mistakes in that part.');
    expect(text()).toContain('Try again');
  });

  it('ignores answers to other requests and late answers', async () => {
    select(1, 40);
    await start('shorter');
    push({ id: 'someone-else', type: 'proposal', html: '<p>Nope.</p>' });
    expect(card.state).toBe('writing');
    card.reject();
    push({ id: 'e1', type: 'proposal', html: '<p>Too late.</p>' });
    await settle();
    expect(card.state).toBe('closed');
  });

  it('only one request runs at a time', async () => {
    select(1, 40);
    card.openMenu();
    const first = card.run('shorter');
    await card.run('rewrite');
    await first;
    expect(edits.length).toBe(1);
  });

  it('drops her version when the selected text was changed meanwhile', async () => {
    select(5, 17);
    await start('rewrite');
    push({ id: 'e1', type: 'proposal', html: '<p>Mitochondria</p>' });
    await settle();
    editor.commands.insertContentAt(8, 'XX');                         // typed inside the marked words
    await settle();
    expect(card.state).toBe('message');
    expect(text()).toContain('The text changed, so I dropped my version.');
    expect(text()).not.toContain('Try again');
    card.accept();                                                    // must do nothing now
    expect(editor.getText()).toContain('mitXXochondria');
  });

  it('typing somewhere else keeps her version, and Accept still hits the right words', async () => {
    select(5, 17);
    await start('rewrite');
    push({ id: 'e1', type: 'proposal', html: '<p>Mitochondria</p>' });
    await settle();
    editor.commands.insertContentAt(1, 'Note: ');
    await settle();
    expect(card.state).toBe('proposal');
    card.accept();
    expect(editor.getText()).toContain('Note: The Mitochondria is the the powerhouse.');
  });

  it('goes away when another note is opened', async () => {
    select(1, 40);
    await start('shorter');
    fixture.componentRef.setInput('noteId', 4);
    await settle();
    expect(card.state).toBe('closed');
    push({ id: 'e1', type: 'proposal', html: '<p>Short.</p>' });
    expect(card.state).toBe('closed');
  });

  it('says so when Aria is not running, and Start gets back to the menu', async () => {
    editResult = () => ({ ok: false, error: 'not-running' });
    select(1, 40);
    await start('shorter');
    expect(card.state).toBe('offline');
    expect(text()).toContain("Aria isn't running");
    await card.startAria();
    await settle();
    expect(card.state).toBe('menu');
  });

  it('Explain asks in the Aria panel and changes nothing', async () => {
    const model = TestBed.inject(ModelService);
    let open = false;
    model.ariaPanelOpen$.subscribe((v: boolean) => open = v);
    select(5, 17);
    card.openMenu();
    await card.explain();
    await settle();
    expect(open).toBeTrue();
    expect(asked.length).toBe(1);
    expect(asked[0]).toContain('mitochondria');
    expect(asked[0].toLowerCase()).toContain('explain');
    expect(card.state).toBe('closed');
    expect(edits).toEqual([]);
  });

  it('Escape closes it', async () => {
    select(1, 40);
    card.openMenu();
    card.onKey(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(card.state).toBe('closed');
  });
});
