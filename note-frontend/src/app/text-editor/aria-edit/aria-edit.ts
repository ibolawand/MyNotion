import { ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Editor } from '@tiptap/core';
import { AriaChat } from '../../aria-panel/aria-chat';
import { ModelService } from '../../model.service';
import { AriaEditRequest, AriaEvent } from '../../../services/NoteService';
import { ariaRange, clearAriaRange, rangeHtml, setAriaRange } from '../aria-range';

type Action = AriaEditRequest['action'];
type State = 'closed' | 'menu' | 'writing' | 'proposal' | 'message' | 'offline';

const CONTEXT_EACH_SIDE = 800;
const EXPLAIN_CHARS = 1500;

/** "Select text, ask Aria": a card under the selected text. First a menu (Rewrite, Shorter, Fix spelling, Make a
 *  table, Explain, or your own instruction), then Aria's version of that text, drawn as it would look in the
 *  note, with Accept / Try again / Reject. The note only changes on Accept, and then like a paste, so Ctrl+Z
 *  undoes it. Aria herself never writes to the note for this (see note/src/aria.ts and BetterAI's NoteWriter.rework). */
@Component({
  selector: 'aria-edit',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './aria-edit.html',
  styleUrls: ['./aria-edit.css'],
})
export class AriaEdit implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) editor!: Editor;
  @Input() title = '';
  /** the open note: when it changes, whatever was going on here is over */
  @Input() noteId: number | null | undefined = null;

  state: State = 'closed';
  top = 0;
  left = 0;
  width = 480;
  instruction = '';      // the box in the menu
  steerText = '';        // the box under her version
  message = '';
  canRetry = false;
  starting = false;

  readonly actions: { id: Action; label: string }[] = [
    { id: 'rewrite', label: 'Rewrite' }, { id: 'shorter', label: 'Shorter' },
    { id: 'spelling', label: 'Fix spelling' }, { id: 'table', label: 'Make a table' },
  ];

  @ViewChild('preview') private previewEl?: ElementRef<HTMLElement>;
  @ViewChild('own') private ownInput?: ElementRef<HTMLInputElement>;
  private preview?: Editor;
  private requestId: string | null = null;
  private sending = false;
  private original = '';                 // the selection as it was sent
  private last: AriaEditRequest | null = null;
  private proposal = '';
  private stopEvents?: () => void;
  private readonly onDocChange = () => this.zone.run(() => this.checkStillThere());

  constructor(private host: ElementRef<HTMLElement>, private zone: NgZone, private cdr: ChangeDetectorRef,
              private chat: AriaChat, private modelService: ModelService) {}

  private get api() { return window.electronAPI?.aria; }

  ngOnInit() {
    this.stopEvents = this.api?.onEvent?.(e => this.zone.run(() => this.onEvent(e)));
    this.editor.on('update', this.onDocChange);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['noteId'] && !changes['noteId'].firstChange) this.close();
  }

  ngOnDestroy() {
    this.stopEvents?.();
    this.editor?.off('update', this.onDocChange);
    this.preview?.destroy();
  }

  /** From the Aria button in the selection toolbar. */
  openMenu() {
    const { from, to, empty } = this.editor.state.selection;
    if (empty || this.state === 'writing') return;
    this.reset();
    setAriaRange(this.editor, from, to);
    if (!ariaRange(this.editor.state)) return;
    this.place(to);
    this.state = 'menu';
    this.instruction = '';
    setTimeout(() => this.ownInput?.nativeElement.focus());
  }

  async runOwn() {
    const text = this.instruction.trim();
    if (text) await this.run('custom', text);
  }

  async run(action: Action, instruction = '', previous = '') {
    const range = ariaRange(this.editor.state);
    if (!range || this.sending || this.state === 'writing') return;
    const doc = this.editor.state.doc;
    const around = doc.textBetween(Math.max(0, range.from - CONTEXT_EACH_SIDE), Math.min(doc.content.size, range.to + CONTEXT_EACH_SIDE), '\n', ' ');
    await this.send({ action, html: rangeHtml(this.editor.state, range), instruction: instruction.trim(),
                      title: this.title ?? '', context: around, previous });
  }

  private async send(request: AriaEditRequest) {
    this.sending = true;
    this.last = request;
    this.original = request.html;
    this.state = 'writing';
    this.requestId = null;
    let result: { ok: true; id: string } | { ok: false; error: 'not-running' } | undefined;
    try { result = await this.api?.edit?.(request); } catch { result = undefined; }
    this.sending = false;
    if (this.state !== 'writing') return;            // rejected or the note changed while we were sending
    if (!result?.ok) { this.state = 'offline'; return; }
    this.requestId = result.id;
  }

  async tryAgain() {
    if (!this.last || !this.stillThere()) return;
    await this.send({ ...this.last, previous: this.proposal });
  }

  /** "keep the exercise numbers": the same text again, with that added to what was asked. */
  async steer() {
    const more = this.steerText.trim();
    if (!more || !this.last || !this.stillThere()) return;
    this.steerText = '';
    const instruction = this.last.action === 'custom' ? `${this.last.instruction}. ${more}` : more;
    await this.send({ ...this.last, instruction, previous: '' });
  }

  /** Changes nothing: Aria explains the selected text in her panel. */
  async explain() {
    const range = ariaRange(this.editor.state);
    if (!range) return;
    const text = this.editor.state.doc.textBetween(range.from, range.to, '\n', ' ').trim().slice(0, EXPLAIN_CHARS);
    this.close();
    if (!text) return;
    this.modelService.openAriaPanel();
    await this.chat.ask(`Explain this part of my note${this.title ? ` "${this.title}"` : ''} simply:\n${text}`);
  }

  accept() {
    const range = ariaRange(this.editor.state);
    if (this.state !== 'proposal' || !range || !this.proposal || !this.stillThere()) return;
    const html = this.proposal;
    this.close();
    // like a paste over the selection: part of a line stays part of that line, list items stay in their list,
    // and one Ctrl+Z takes it back
    this.editor.chain().focus().setTextSelection(range).run();
    this.editor.view.pasteHTML(html);
  }

  reject() { this.close(); }

  close() {
    this.reset();
    if (this.editor && !this.editor.isDestroyed) clearAriaRange(this.editor);
  }

  async startAria() {
    this.starting = true;
    const ok = await this.chat.startAria();
    this.starting = false;
    if (ok && this.state === 'offline') this.state = ariaRange(this.editor.state) ? 'menu' : 'closed';
    else if (!ok) this.message = this.chat.startError;
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); this.editor.commands.focus(); }
  }

  private reset() {
    this.state = 'closed';
    this.requestId = null;
    this.proposal = '';
    this.message = '';
    this.steerText = '';
    this.last = null;
  }

  private onEvent(e: AriaEvent) {
    if (!e || !this.requestId || e.id !== this.requestId || this.state !== 'writing') return;
    this.requestId = null;
    if (e.type === 'proposal') {
      this.proposal = e.html;
      this.state = 'proposal';
      this.cdr.detectChanges();                      // the preview's element exists from here on
      this.draw(e.html);
    } else if (e.type === 'error') {
      this.say(e.message, true);
    }
  }

  private say(message: string, canRetry: boolean) {
    this.message = message;
    this.canRetry = canRetry;
    this.state = 'message';
    this.requestId = null;
  }

  /** Is the marked text still what was sent? */
  private stillThere(): boolean {
    const range = ariaRange(this.editor.state);
    return !!range && rangeHtml(this.editor.state, range) === this.original;
  }

  private checkStillThere() {
    if (this.state === 'closed' || this.state === 'menu' || this.state === 'offline') {
      if (this.state !== 'closed' && !ariaRange(this.editor.state)) this.reset();
      return;
    }
    if (this.state === 'message' && !this.canRetry) return;
    if (!this.stillThere()) {
      this.proposal = '';
      this.say('The text changed, so I dropped my version.', false);
    } else {
      const range = ariaRange(this.editor.state);
      if (range) this.place(range.to);
    }
  }

  /** Her version, drawn by a read-only copy of the note's editor, so it looks as it will in the note. */
  private draw(html: string) {
    const element = this.previewEl?.nativeElement;
    if (!element) return;
    if (!this.preview || this.preview.isDestroyed || this.preview.options.element !== element) {
      this.preview?.destroy();
      this.preview = new Editor({ element, editable: false, extensions: this.editor.options.extensions, content: html,
        editorProps: { attributes: { class: 'tiptap-editor-content' } } });
    } else {
      this.preview.commands.setContent(html);
    }
  }

  /** Under the end of the selection, inside the scrolling page (so it moves with the text). */
  private place(pos: number) {
    const parent = this.host.nativeElement.offsetParent as HTMLElement | null ?? this.host.nativeElement.parentElement;
    if (!parent) return;
    let coords: { bottom: number; left: number };
    try { coords = this.editor.view.coordsAtPos(pos); } catch { return; }
    const box = parent.getBoundingClientRect();
    this.width = Math.max(260, Math.min(520, parent.clientWidth - 24));
    this.top = coords.bottom - box.top + parent.scrollTop + 8;
    this.left = Math.max(12, Math.min(coords.left - box.left - 40, parent.clientWidth - this.width - 12));
  }
}
