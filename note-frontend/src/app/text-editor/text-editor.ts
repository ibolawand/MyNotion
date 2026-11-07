import { Component, OnInit, OnDestroy, ElementRef, HostListener, ViewChild, NgZone } from '@angular/core';
import { NoteService } from '../../services/NoteService';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Note } from '../../model/models';
import { ModelService } from '../model.service';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import katex from 'katex';
import { TiptapEditorDirective, TiptapBubbleMenuDirective } from 'ngx-tiptap';

/** One entry of the "/" menu. `hint` is the Markdown shortcut that does the same while typing. */
interface SlashItem {
  id: string;
  label: string;
  description: string;
  hint: string;
  keywords: string;
  run: (editor: Editor) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  { id: 'text', label: 'Text', description: 'Plain paragraph', hint: '', keywords: 'paragraph plain normal',
    run: e => e.chain().focus().setParagraph().run() },
  { id: 'h1', label: 'Heading 1', description: 'Big section title', hint: '#', keywords: 'title h1 heading',
    run: e => e.chain().focus().setHeading({ level: 1 }).run() },
  { id: 'h2', label: 'Heading 2', description: 'Medium section title', hint: '##', keywords: 'subtitle h2 heading',
    run: e => e.chain().focus().setHeading({ level: 2 }).run() },
  { id: 'h3', label: 'Heading 3', description: 'Small section title', hint: '###', keywords: 'h3 heading',
    run: e => e.chain().focus().setHeading({ level: 3 }).run() },
  { id: 'todo', label: 'To-do list', description: 'Things to tick off', hint: '[ ]', keywords: 'task checkbox check todo',
    run: e => e.chain().focus().toggleTaskList().run() },
  { id: 'bullet', label: 'Bullet list', description: 'A simple list', hint: '-', keywords: 'unordered ul points',
    run: e => e.chain().focus().toggleBulletList().run() },
  { id: 'numbered', label: 'Numbered list', description: 'Steps in order', hint: '1.', keywords: 'ordered ol steps',
    run: e => e.chain().focus().toggleOrderedList().run() },
  { id: 'quote', label: 'Quote', description: 'Someone else\'s words, or a key idea', hint: '>', keywords: 'blockquote cite',
    run: e => e.chain().focus().toggleBlockquote().run() },
  { id: 'code', label: 'Code', description: 'Code that keeps its spacing', hint: '```', keywords: 'snippet pre program',
    run: e => e.chain().focus().toggleCodeBlock().run() },
  // (the formula box opens for these; the formula is inserted when it's saved — see chooseSlash)
  { id: 'math', label: 'Math', description: 'A formula inside the text, like x²', hint: '$$', keywords: 'math formula equation latex tex',
    run: () => {} },
  { id: 'mathblock', label: 'Math block', description: 'A formula on its own line', hint: '$$$', keywords: 'math formula equation latex tex block',
    run: () => {} },
  { id: 'divider', label: 'Divider', description: 'A line between sections', hint: '---', keywords: 'hr rule separator line',
    run: e => e.chain().focus().setHorizontalRule().run() },
  { id: 'date', label: 'Today\'s date', description: 'Inserts the date', hint: '', keywords: 'date today time now',
    run: e => e.chain().focus().insertContent(new Date().toLocaleDateString(undefined,
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' ').run() },
];

const FONT_KEY = 'mynotion.editorFont';

/** One-click pieces for the formula box, so nobody has to remember LaTeX. `at`/`sel`: the placeholder that gets
 *  selected, so typing replaces it (\frac{a}{b}: the "a"). */
export const MATH_SNIPPETS: { label: string; tex: string; at?: number; sel?: number }[] = [
  { label: 'x²', tex: '^{2}', at: 2, sel: 1 }, { label: 'xₙ', tex: '_{n}', at: 2, sel: 1 },
  { label: 'a/b', tex: '\\frac{a}{b}', at: 6, sel: 1 }, { label: '√', tex: '\\sqrt{x}', at: 6, sel: 1 }, { label: 'Σ', tex: '\\sum_{i=1}^{n} ' }, { label: '∫', tex: '\\int_{a}^{b} ' },
  { label: 'lim', tex: '\\lim_{x \\to \\infty} ' }, { label: '·', tex: '\\cdot ' }, { label: '≤', tex: '\\le ' },
  { label: '≠', tex: '\\neq ' }, { label: '±', tex: '\\pm ' }, { label: '→', tex: '\\to ' }, { label: '∞', tex: '\\infty' },
  { label: 'α', tex: '\\alpha' }, { label: 'β', tex: '\\beta' }, { label: 'π', tex: '\\pi' }, { label: 'θ', tex: '\\theta' },
  { label: 'Δ', tex: '\\Delta ' }, { label: 'λ', tex: '\\lambda' }, { label: 'μ', tex: '\\mu' }, { label: 'Ω', tex: '\\Omega' },
];

@Component({
  selector: 'text-editor',
  standalone: true,
  imports: [FormsModule, TiptapEditorDirective, TiptapBubbleMenuDirective],
  templateUrl: './text-editor.html',
  styleUrls: ['./text-editor.css', './note-content.css', './math.css']
})
export class TextEditor implements OnInit, OnDestroy {
  @ViewChild('linkInput') linkInput?: ElementRef<HTMLInputElement>;
  @ViewChild('slashMenu') slashMenuEl?: ElementRef<HTMLElement>;
  @ViewChild('mathInput') mathInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('mathPreview') mathPreview?: ElementRef<HTMLElement>;

  // the formula box: editing one inline or block formula
  math: { type: 'inline' | 'block'; pos: number; latex: string; original: string; isNew: boolean;
          top: number; left: number } | null = null;
  mathError = '';
  readonly mathSnippets = MATH_SNIPPETS;

  currentNote: Note | null = null;
  private noteSub?: Subscription;
  editor!: Editor;

  readonly highlights = [
    { color: '#fde68a', label: 'Yellow' },
    { color: '#bbf7d0', label: 'Green' },
    { color: '#fecaca', label: 'Red' },
    { color: '#bfdbfe', label: 'Blue' },
  ];

  // "/" menu
  slashOpen = false;
  slashQuery = '';
  slashIndex = 0;
  slashItems: SlashItem[] = SLASH_ITEMS;
  slashPos = { top: 0, left: 0 };
  private slashFrom = 0;          // where the "/" is, so it can be removed when a block is chosen

  // link editing in the bubble menu
  linkEditing = false;
  linkUrl = '';

  font: 'serif' | 'sans' = 'serif';
  words = 0;

  constructor(
    protected modelService: ModelService,
    protected noteService: NoteService,
    private zone: NgZone,
    private host: ElementRef<HTMLElement>
  ) { }

  ngOnInit(): void {
    try {
      this.font = localStorage.getItem(FONT_KEY) === 'sans' ? 'sans' : 'serif';
    } catch { /* storage unavailable: keep the default */ }

    this.editor = new Editor({
      extensions: [
        StarterKit.configure({
          link: { openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: 'noopener', target: '_blank' } },
        }),
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        // checklists: ticking a box updates the note (and Aria can tick items too)
        TaskList,
        TaskItem.configure({ nested: true }),
        // formulas: $$x^2$$ inline, $$$…$$$ as a block; click one to edit it in the formula box
        // (configured one by one: the combined Mathematics extension gives blocks the inline options, so a block
        // formula came out small instead of in display size)
        InlineMath.configure({
          katexOptions: { throwOnError: false },
          onClick: (node, pos) => this.zone.run(() => this.openMath('inline', pos, node.attrs['latex'])),
        }),
        BlockMath.configure({
          katexOptions: { throwOnError: false, displayMode: true },
          onClick: (node, pos) => this.zone.run(() => this.openMath('block', pos, node.attrs['latex'])),
        }),
        Placeholder.configure({
          includeChildren: false,
          placeholder: ({ node, editor }) => {
            if (node.type.name === 'heading') return `Heading ${node.attrs['level']}`;
            if (editor.isEmpty) return 'Start writing, or type / to add a heading, list, to-do and more';
            return 'Type / for blocks';
          },
        }),
      ],
      content: '',
      editorProps: {
        attributes: { class: 'tiptap-editor-content', spellcheck: 'true' },
        handleKeyDown: (_view, event) => this.onEditorKey(event),
      },
      onUpdate: ({ editor }) => {
        this.updateSlash();
        this.words = this.countWords();
        if (this.currentNote) {
          this.currentNote.content = editor.getHTML();
          this.modelService.updateCurrentNote(this.currentNote);
          this.noteService.triggerAutoSave(this.currentNote);
        }
      },
      onSelectionUpdate: () => this.updateSlash(),
      onBlur: () => setTimeout(() => this.zone.run(() => { if (!this.menuHasFocus()) this.closeSlash(); }), 120),
    });

    this.noteSub = this.modelService.currentNote$.subscribe((note: Note | null) => {
      if (note) {
        const switched = note.id !== this.currentNote?.id;
        this.currentNote = note;
        // Only reload when the content differs: this also fires on every keystroke,
        // and resetting identical content would move the cursor.
        if ((note.content ?? '') !== this.editor.getHTML()) {
          this.editor.commands.setContent(note.content ?? '', { emitUpdate: false });
        }
        if (switched) {
          this.closeSlash();
          this.linkEditing = false;
        }
      } else {
        this.currentNote = null;
        this.editor.commands.clearContent(false);
      }
      this.words = this.countWords();
    });
  }

  ngOnDestroy(): void {
    this.noteSub?.unsubscribe();
    this.editor?.destroy();
  }

  // ── toolbar ──

  run(fn: (e: Editor) => void) {
    fn(this.editor);
  }

  isActive(name: string, attributes?: any): boolean {
    return this.editor?.isActive(name, attributes) ?? false;
  }

  bold = (e: Editor) => e.chain().focus().toggleBold().run();
  italic = (e: Editor) => e.chain().focus().toggleItalic().run();
  underline = (e: Editor) => e.chain().focus().toggleUnderline().run();
  strike = (e: Editor) => e.chain().focus().toggleStrike().run();
  inlineCode = (e: Editor) => e.chain().focus().toggleCode().run();
  heading = (level: 1 | 2 | 3) => (e: Editor) => e.chain().focus().toggleHeading({ level }).run();
  bullets = (e: Editor) => e.chain().focus().toggleBulletList().run();
  numbers = (e: Editor) => e.chain().focus().toggleOrderedList().run();
  todos = (e: Editor) => e.chain().focus().toggleTaskList().run();
  quote = (e: Editor) => e.chain().focus().toggleBlockquote().run();
  codeBlock = (e: Editor) => e.chain().focus().toggleCodeBlock().run();
  divider = (e: Editor) => e.chain().focus().setHorizontalRule().run();
  undo = (e: Editor) => e.chain().focus().undo().run();
  redo = (e: Editor) => e.chain().focus().redo().run();

  setColor(color: string) {
    this.editor.chain().focus().setColor(color).run();
  }

  setHighlight(color: string) {
    this.editor.chain().focus().toggleHighlight({ color }).run();
  }

  clearMarks() {
    this.editor.chain().focus().unsetAllMarks().run();
  }

  // ── links (Ctrl+K, or the link button in the bubble menu) ──

  startLink() {
    this.linkUrl = this.editor.getAttributes('link')['href'] ?? '';
    this.linkEditing = true;
    setTimeout(() => this.linkInput?.nativeElement.focus(), 0);
  }

  applyLink() {
    let url = this.linkUrl.trim();
    const chain = this.editor.chain().focus().extendMarkRange('link');
    if (!url) {
      chain.unsetLink().run();
    } else {
      if (!/^[a-z]+:/i.test(url)) url = 'https://' + url;
      chain.setLink({ href: url }).run();
    }
    this.linkEditing = false;
  }

  cancelLink() {
    this.linkEditing = false;
    this.editor.commands.focus();
  }

  removeLink() {
    this.linkUrl = '';
    this.applyLink();
  }

  openLink() {
    const href = this.editor.getAttributes('link')['href'];
    if (href) window.open(href, '_blank', 'noopener');
  }

  showBubble = ({ editor, from, to }: { editor: Editor; from: number; to: number }) => {
    if (this.linkEditing) return true;
    if (editor.isActive('codeBlock') || editor.isActive('blockMath') || editor.isActive('inlineMath')) return false;
    return from !== to || editor.isActive('link');
  };

  // ── "/" menu ──

  /** Open the menu while the text before the cursor in this block is "/" plus a word. */
  private updateSlash() {
    const { state } = this.editor;
    const { $from, empty } = state.selection;
    if (!empty || $from.parent.type.name === 'codeBlock') return this.closeSlash();
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
    const m = /(?:^|\s)\/([\p{L}\d' ]{0,20})$/u.exec(before);
    if (!m || m[1].includes('  ')) return this.closeSlash();
    const query = m[1].toLowerCase().trim();
    // every typed word must start a word of the label or keywords ("to" -> To-do, Today's date, not "separator";
    // "math b" -> Math block); label matches first
    const qWords = query.split(/\s+/).filter(Boolean);
    const starts = (text: string) => {
      const words = text.toLowerCase().split(/[\s-']+/);
      return qWords.every(q => words.some(w => w.startsWith(q)));
    };
    const items = SLASH_ITEMS
      .filter(i => !query || starts(i.label) || starts(i.keywords))
      .sort((a, b) => (query && !starts(a.label) ? 1 : 0) - (query && !starts(b.label) ? 1 : 0));
    if (!items.length) return this.closeSlash();
    this.slashFrom = $from.pos - m[1].length - 1;
    if (!this.slashOpen || query !== this.slashQuery) this.slashIndex = 0;
    this.slashQuery = query;
    this.slashItems = items;
    this.slashOpen = true;
    this.placeSlash();
  }

  private placeSlash() {
    const coords = this.editor.view.coordsAtPos(this.slashFrom);
    const box = this.host.nativeElement.getBoundingClientRect();
    const menuHeight = 340;
    const below = coords.bottom - box.top + 6;
    const flip = coords.bottom + menuHeight > window.innerHeight && coords.top - box.top > menuHeight;
    this.slashPos = {
      top: flip ? coords.top - box.top - menuHeight - 6 : below,
      left: Math.max(8, Math.min(coords.left - box.left, box.width - 300)),
    };
  }

  closeSlash() {
    this.slashOpen = false;
  }

  chooseSlash(item: SlashItem) {
    const to = this.editor.state.selection.from;
    this.editor.chain().focus().deleteRange({ from: this.slashFrom, to }).run();
    item.run(this.editor);
    this.closeSlash();
    if (item.id === 'math' || item.id === 'mathblock') this.openNewMath(item.id === 'math' ? 'inline' : 'block');
  }

  // ── formulas ──

  /** Toolbar ∑: the formula box at the cursor; the formula goes in when it's saved. */
  insertMath() {
    this.openNewMath('inline');
  }

  /** A new formula at the cursor (TipTap won't insert an empty one, so it's inserted on save). */
  private openNewMath(type: 'inline' | 'block') {
    this.openMath(type, this.editor.state.selection.from, '', true);
  }

  openMath(type: 'inline' | 'block', pos: number, latex: string, isNew = false) {
    const box = this.host.nativeElement.getBoundingClientRect();
    const dom = isNew ? null : this.editor.view.nodeDOM(pos) as HTMLElement | null;
    const r = dom?.getBoundingClientRect() ?? this.editor.view.coordsAtPos(pos);
    this.math = {
      type, pos, latex: latex ?? '', original: latex ?? '', isNew,
      top: r.bottom - box.top + 8,
      left: Math.max(8, Math.min(r.left - box.left, box.width - 380)),
    };
    setTimeout(() => {
      this.renderMathPreview();
      const input = this.mathInput?.nativeElement;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }, 0);
  }

  renderMathPreview() {
    const el = this.mathPreview?.nativeElement;
    if (!el || !this.math) return;
    this.mathError = '';
    if (!this.math.latex.trim()) {
      el.textContent = 'Your formula shows here';
      el.classList.add('empty');
      return;
    }
    el.classList.remove('empty');
    try {
      katex.render(this.math.latex, el, { throwOnError: true, displayMode: this.math.type === 'block' });
    } catch (e: any) {
      this.mathError = String(e?.message || e).replace(/^KaTeX parse error: /, '');
      katex.render(this.math.latex, el, { throwOnError: false, displayMode: this.math.type === 'block' });
    }
  }

  addSnippet(sn: { tex: string; at?: number; sel?: number }) {
    const input = this.mathInput?.nativeElement;
    if (!input || !this.math) return;
    const start = input.selectionStart ?? this.math.latex.length;
    const end = input.selectionEnd ?? start;
    this.math.latex = this.math.latex.slice(0, start) + sn.tex + this.math.latex.slice(end);
    const cursor = start + (sn.at ?? sn.tex.length);
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(cursor, cursor + (sn.sel ?? 0));
      this.renderMathPreview();
    }, 0);
  }

  saveMath() {
    const m = this.math;
    if (!m) return;
    this.math = null;
    const chain = this.editor.chain().focus();
    const latex = m.latex.trim();
    if (m.isNew) {
      if (latex) {
        (m.type === 'inline' ? chain.insertInlineMath({ latex, pos: m.pos }) : chain.insertBlockMath({ latex, pos: m.pos })).run();
        if (m.type === 'inline') this.editor.commands.insertContent(' ');      // keep typing after it
        else this.cursorBelowBlock(m.pos);
      } else {
        chain.run();
      }
    } else if (!latex) {
      (m.type === 'inline' ? chain.deleteInlineMath({ pos: m.pos }) : chain.deleteBlockMath({ pos: m.pos })).run();
    } else {
      (m.type === 'inline' ? chain.updateInlineMath({ latex: m.latex.trim(), pos: m.pos })
        : chain.updateBlockMath({ latex: m.latex.trim(), pos: m.pos })).run();
    }
  }

  /** After a new block formula the cursor goes to the line below it; left selected, the next key would replace it. */
  private cursorBelowBlock(near: number) {
    const { doc } = this.editor.state;
    let end = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === 'blockMath' && (end < 0 || Math.abs(pos - near) < Math.abs(end - near))) end = pos + node.nodeSize;
      return node.type.name !== 'blockMath';
    });
    if (end < 0) return;
    const next = doc.resolve(end).nodeAfter;
    if (next?.isTextblock) {
      this.editor.chain().focus().setTextSelection(end + 1).run();
    } else {
      this.editor.chain().focus().insertContentAt(end, { type: 'paragraph' }).setTextSelection(end + 1).run();
    }
  }

  cancelMath() {
    const m = this.math;
    if (!m) return;
    this.math = null;
    this.editor.commands.focus();          // nothing was inserted for a new one, nothing changes for an old one
  }

  /** A click anywhere outside the formula box saves it (an empty one is removed). */
  @HostListener('document:mousedown', ['$event'])
  onDocMouseDown(e: MouseEvent) {
    if (this.math && !(e.target as HTMLElement)?.closest?.('.math-box')) this.saveMath();
  }

  onMathKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.saveMath();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.cancelMath();
    }
  }

  private menuHasFocus(): boolean {
    const el = this.slashMenuEl?.nativeElement;
    return !!el && el.contains(document.activeElement);
  }

  private onEditorKey(event: KeyboardEvent): boolean {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.zone.run(() => this.startLink());
      return true;
    }
    if (!this.slashOpen) return false;
    const n = this.slashItems.length;
    switch (event.key) {
      case 'ArrowDown':
        this.zone.run(() => this.slashIndex = (this.slashIndex + 1) % n);
        this.scrollSlashIntoView();
        return true;
      case 'ArrowUp':
        this.zone.run(() => this.slashIndex = (this.slashIndex - 1 + n) % n);
        this.scrollSlashIntoView();
        return true;
      case 'Enter':
      case 'Tab':
        this.zone.run(() => this.chooseSlash(this.slashItems[this.slashIndex]));
        return true;
      case 'Escape':
        this.zone.run(() => this.closeSlash());
        return true;
    }
    return false;
  }

  private scrollSlashIntoView() {
    setTimeout(() => this.slashMenuEl?.nativeElement
      .querySelector('.slash-item.selected')?.scrollIntoView({ block: 'nearest' }), 0);
  }

  // ── footer ──

  toggleFont() {
    this.font = this.font === 'serif' ? 'sans' : 'serif';
    try {
      localStorage.setItem(FONT_KEY, this.font);
    } catch { /* not saved, fine */ }
  }

  private countWords(): number {
    const text = this.editor?.getText() ?? '';
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  get readingTime(): string {
    const min = Math.max(1, Math.round(this.words / 220));
    return `${min} min read`;
  }

  focusEnd(event: MouseEvent) {
    // clicking the empty space under the text puts the cursor at the end, like on paper
    if (event.target === event.currentTarget) this.editor.commands.focus('end');
  }
}
