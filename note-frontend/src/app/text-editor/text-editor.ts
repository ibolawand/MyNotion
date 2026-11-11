import { Component, OnInit, OnDestroy, ElementRef, HostListener, ViewChild, NgZone, ChangeDetectorRef, inject } from '@angular/core';
import { SceneMode, StudyScene } from '../study-scene/study-scene';
import { RadioButton } from '../radio/radio-button';
import { DomSanitizer } from '@angular/platform-browser';
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
import { InlineMath } from '@tiptap/extension-mathematics';
import { NodeSelection } from '@tiptap/pm/state';
import { ALIGNED_TEXT, ALIGNS, Align, AlignedBlockMath } from './aligned-math';
import { TabKey } from './tab-key';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { Callout } from './callout';
import { FindReplace, findState } from './find';
import { OutlineItem, activeHeading, outlineOf } from './outline';
import { ACCEPTED, NoteImage, imageFiles, prepareImage } from './note-image';
import { MoveBlock } from './move-block';
import { NOTE_TYPING } from './typing';
import { looksLikeMarkdown, markdownToHtml } from './markdown-paste';
import { matchNotes, noteHref, noteIdOf } from './note-links';
import { katexCss, printableHtml } from './export-pdf';
import { NOTE_TABLE, tableInfo } from './note-table';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import katex from 'katex';
import { DueDates } from './due-dates';
import { KINDS, MAX_SIZE, Matrix, MatrixKind, OPS, blankMatrix, chainToLatex, findMatrices, fromChain, resize, setBar, trimmed } from './matrix';
import { TiptapEditorDirective, TiptapBubbleMenuDirective } from 'ngx-tiptap';
import { AriaRange } from './aria-range';
import { AriaEdit } from './aria-edit/aria-edit';

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
  { id: 'matrix', label: 'Matrix', description: 'Numbers in a grid, filled in box by box', hint: '', keywords: 'matrix matrices grid determinant vector math',
    run: () => {} },
  { id: 'callout', label: 'Callout', description: 'A coloured box to make something stand out (click its icon for another kind)',
    hint: '', keywords: 'callout box note tip important warning info highlight remember',
    run: e => e.chain().focus().setCallout('note').run() },
  { id: 'toggle', label: 'Toggle', description: 'A title that folds the text under it away (good for practice questions)',
    hint: '', keywords: 'toggle fold collapse details hide spoiler question answer',
    run: e => { e.chain().focus().setDetails().run(); openToggleAtCursor(e); } },
  // (opens the file picker: see chooseSlash)
  { id: 'image', label: 'Image', description: 'A picture from your computer (or paste / drop one straight in)', hint: '',
    keywords: 'image picture photo screenshot img upload',
    run: () => {} },
  { id: 'vector', label: 'Vector', description: 'A column vector, filled in box by box', hint: '',
    keywords: 'vector vektor column arrow',
    run: () => {} },
  { id: 'table', label: 'Table', description: 'Rows and columns (Tab jumps to the next box)', hint: '',
    keywords: 'table grid rows columns tabelle spreadsheet',
    run: e => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: 'divider', label: 'Divider', description: 'A line between sections', hint: '---', keywords: 'hr rule separator line',
    run: e => e.chain().focus().setHorizontalRule().run() },
  { id: 'date', label: 'Today\'s date', description: 'Inserts the date', hint: '', keywords: 'date today time now',
    run: e => e.chain().focus().insertContent(new Date().toLocaleDateString(undefined,
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' ').run() },
];

/** A new toggle starts open, so what you type next goes under its title (and Enter in the title goes there too). */
function openToggleAtCursor(e: Editor) {
  const { $from } = e.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'details') {
      e.view.dispatch(e.state.tr.setNodeAttribute($from.before(d), 'open', true));
      return;
    }
  }
}

const FONT_KEY = 'mynotion.editorFont';
const OUTLINE_KEY = 'mynotion.outline';
const SCENE_KEY = 'mynotion.scene';
const SCENE_NEXT: Record<SceneMode, SceneMode> = { off: 'corner', corner: 'background', background: 'off' };

/** The formula box: editing one inline or block formula. */
interface MathState { type: 'inline' | 'block'; pos: number; latex: string; original: string; isNew: boolean; top: number; left: number;
                     above: number; align?: Align; dragged?: boolean; }
/** A matrix built from inside the formula box goes back into that formula, replacing at..end. */
interface GridTarget { math: MathState; at: number; end: number; }

/** One-click pieces for the formula box, so nobody has to remember LaTeX. `at`/`sel`: the placeholder that gets
 *  selected, so typing replaces it (\frac{a}{b}: the "a"). */
/** `face`: draw the button's label with KaTeX (for symbols the UI font can't show, like the arrow over v). */
export const MATH_SNIPPETS: { label: string; tex: string; at?: number; sel?: number; face?: string }[] = [
  { label: 'x²', tex: '^{2}', at: 2, sel: 1 }, { label: 'xₙ', tex: '_{n}', at: 2, sel: 1 },
  { label: 'a/b', tex: '\\frac{a}{b}', at: 6, sel: 1 }, { label: '√', tex: '\\sqrt{x}', at: 6, sel: 1 }, { label: 'Σ', tex: '\\sum_{i=1}^{n} ' }, { label: '∫', tex: '\\int_{a}^{b} ' },
  { label: 'lim', tex: '\\lim_{x \\to \\infty} ' }, { label: '·', tex: '\\cdot ' }, { label: '≤', tex: '\\le ' },
  { label: '≠', tex: '\\neq ', face: '\\neq' }, { label: '±', tex: '\\pm ' }, { label: '→', tex: '\\to ' }, { label: '∞', tex: '\\infty' },
  { label: 'α', tex: '\\alpha' }, { label: 'β', tex: '\\beta' }, { label: 'π', tex: '\\pi' }, { label: 'θ', tex: '\\theta' },
  { label: 'Vector v', tex: '\\vec{v}', at: 5, sel: 1, face: '\\vec{v}' },
  { label: 'Vector from A to B', tex: '\\overrightarrow{AB}', at: 16, sel: 2, face: '\\overrightarrow{AB}' },
  { label: 'Length of a vector', tex: '\\left| \\vec{v} \\right|', at: 12, sel: 1, face: '|\\vec{v}|' },
  { label: 'Bar over a letter', tex: '\\overline{x}', at: 10, sel: 1, face: '\\overline{x}' },
  { label: 'Δ', tex: '\\Delta ' }, { label: 'λ', tex: '\\lambda' }, { label: 'μ', tex: '\\mu' }, { label: 'Ω', tex: '\\Omega' },
];

@Component({
  selector: 'text-editor',
  standalone: true,
  imports: [FormsModule, TiptapEditorDirective, TiptapBubbleMenuDirective, StudyScene, RadioButton, AriaEdit],
  templateUrl: './text-editor.html',
  styleUrls: ['./text-editor.css', './note-content.css', './math.css', './blocks.css', './page-tools.css', './tables.css']
})
export class TextEditor implements OnInit, OnDestroy {
  @ViewChild('linkInput') linkInput?: ElementRef<HTMLInputElement>;
  @ViewChild(AriaEdit) ariaEdit?: AriaEdit;
  @ViewChild('slashMenu') slashMenuEl?: ElementRef<HTMLElement>;
  @ViewChild('mathInput') mathInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('mathPreview') mathPreview?: ElementRef<HTMLElement>;

  // the formula box: editing one inline or block formula
  math: MathState | null = null;
  mathError = '';
  readonly mathSnippets = MATH_SNIPPETS;
  /** KaTeX-drawn button labels (our own fixed formulas, so they're trusted as HTML) */
  private readonly sanitizer = inject(DomSanitizer);   // (inject: fields are set up before the constructor runs)
  readonly snippetFaces = new Map(MATH_SNIPPETS.filter(sn => sn.face).map(sn =>
    [sn.label, this.sanitizer.bypassSecurityTrustHtml(katex.renderToString(sn.face!, { throwOnError: false }))]));

  // the matrix box: a grid of boxes for one matrix. `into`: opened from the formula box, so the matrix goes
  // back into that formula (A = …) at `at` instead of becoming a formula of its own
  @ViewChild('gridPreview') gridPreview?: ElementRef<HTMLElement>;
  grid: { items: Matrix[]; ops: string[]; cur: number; type: 'inline' | 'block'; origType: 'inline' | 'block';
          pos: number; isNew: boolean; top: number; left: number; above: number; into?: GridTarget; align: Align;
          dragged?: boolean } | null = null;
  readonly aligns = ALIGNS;
  readonly matrixOps = OPS;
  /** the matrices in the formula being edited, for the "Matrix 1, 2…" buttons */
  mathMatrices: ReturnType<typeof findMatrices> = [];
  readonly matrixKinds = KINDS;
  readonly maxSize = MAX_SIZE;

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

  // find & replace (Ctrl+F / Ctrl+H): the bar at the top right of the page; the marks are drawn by find.ts
  @ViewChild('findInput') findInput?: ElementRef<HTMLInputElement>;
  findOpen = false;
  findReplace = false;           // the second row, "Replace with"
  findQuery = '';
  replaceWith = '';
  findCase = false;

  // the outline: the note's headings at the side, to jump around a long note
  outline: OutlineItem[] = [];
  outlineOn = false;
  outlineActive = -1;

  scene: SceneMode = 'off';

  // Aria reworking this note ("organise this note"): it's locked meanwhile, so nothing typed gets lost
  ariaEditing = false;
  private ariaTimer?: ReturnType<typeof setTimeout>;
  private sentOpenNote: number | null | undefined = undefined;
  private externalSub?: { unsubscribe(): void };

  constructor(
    protected modelService: ModelService,
    protected noteService: NoteService,
    private zone: NgZone,
    private host: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    try {
      this.font = localStorage.getItem(FONT_KEY) === 'sans' ? 'sans' : 'serif';
      this.outlineOn = localStorage.getItem(OUTLINE_KEY) === 'on';
      const scene = localStorage.getItem(SCENE_KEY);
      if (scene === 'corner' || scene === 'background') this.scene = scene;
    } catch { /* storage unavailable: keep the default */ }

    this.editor = new Editor({
      extensions: [
        StarterKit.configure({
          link: { openOnClick: false, autolink: true, linkOnPaste: true, protocols: ['mynotion'],   // (mynotion://note/12: a link to a note)
                  HTMLAttributes: { rel: 'noopener', target: '_blank' } },
        }),
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        // checklists: ticking a box updates the note (and Aria can tick items too)
        TaskList,
        TaskItem.configure({ nested: true }),
        DueDates,   // "· due Fri 13 Nov" chips, and "due friday " -> a date
        ALIGNED_TEXT,   // left / centre / right per line (formulas on their own line: see aligned-math.ts)
        TabKey,         // Tab: a tab space, or one level in inside a list; Shift+Tab undoes it
        FindReplace,    // Ctrl+F / Ctrl+H (the bar is in this component)
        AriaRange,      // the text Aria was asked about stays marked while her card is open (aria-edit/)
        MoveBlock,      // Alt+↑ / Alt+↓ moves the line (or list item, table, toggle…) up or down
        ...NOTE_TABLE,  // /table; the toolbar gets row / column buttons while the cursor is in one
        Subscript,      // H₂O (Ctrl+,)
        Superscript,    // x² in the text (Ctrl+.)
        ...NOTE_TYPING, // -> →, => ⇒, != ≠, <= ≤, >= ≥ … while typing (Backspace undoes)
        Callout,        // coloured boxes: note, tip, important, warning
        // toggles: a title that folds its text away; whether it's open is saved with the note
        Details.configure({ persist: true, HTMLAttributes: { class: 'toggle' } }),
        DetailsSummary,
        DetailsContent,
        // pictures: pasted, dropped or picked; resized by a corner (the picture is stored by the app, see note-image.ts)
        NoteImage.configure({
          resize: { enabled: true, directions: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
                    minWidth: 60, minHeight: 40, alwaysPreserveAspectRatio: true },
        }),
        // formulas: $$x^2$$ inline, $$$…$$$ as a block; click one to edit it in the formula box
        // (configured one by one: the combined Mathematics extension gives blocks the inline options, so a block
        // formula came out small instead of in display size)
        InlineMath.configure({
          katexOptions: { throwOnError: false },
          onClick: (node, pos) => this.zone.run(() => this.openMath('inline', pos, node.attrs['latex'])),
        }),
        AlignedBlockMath.configure({
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
        // a link to another note opens it; Ctrl+click opens a web link in the browser
        handleClick: (view, pos, event) => {
          const $pos = view.state.doc.resolve(pos);
          const link = [...$pos.marks(), ...($pos.nodeAfter?.marks ?? [])].find(m => m.type.name === 'link');
          const href: string | undefined = link?.attrs['href'];
          if (!href || !view.state.selection.empty) return false;
          const id = noteIdOf(href);
          if (id !== null) { this.zone.run(() => this.openNote(id)); return true; }
          if (event.ctrlKey || event.metaKey) { window.open(href, '_blank', 'noopener'); return true; }
          return false;
        },
        // a picture pasted (a screenshot) or dropped in from the file manager goes into the note
        handlePaste: (view, event) => {
          const files = imageFiles(event.clipboardData?.files);
          if (files.length) {
            event.preventDefault();
            this.zone.run(() => this.addImages(files));
            return true;
          }
          // Markdown copied as plain text (ChatGPT, a README…): real headings, lists, tables and formulas.
          // Not inside code, and not when the copy has its own formatting (a web page); Ctrl+Shift+V pastes as is.
          const text = event.clipboardData?.getData('text/plain') ?? '';
          if (event.clipboardData?.getData('text/html') || view.state.selection.$from.parent.type.spec.code
              || this.editor.isActive('code') || !looksLikeMarkdown(text)) return false;
          event.preventDefault();
          this.editor.commands.insertContent(markdownToHtml(text));
          return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          const files = moved ? [] : imageFiles((event as DragEvent).dataTransfer?.files);
          if (!files.length) return false;
          event.preventDefault();
          const at = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })?.pos;
          this.zone.run(() => this.addImages(files, at));
          return true;
        },
      },
      onUpdate: ({ editor }) => {
        this.updateSlash();
        this.words = this.countWords();
        this.refreshOutline();
        this.placeTableBar();
        if (this.currentNote) {
          this.currentNote.content = editor.getHTML();
          this.modelService.updateCurrentNote(this.currentNote);
          this.noteService.triggerAutoSave(this.currentNote);
        }
      },
      onSelectionUpdate: () => { this.updateSlash(); this.placeTableBar(); },
      onBlur: () => setTimeout(() => this.zone.run(() => { if (!this.menuHasFocus()) this.closeSlash(); }), 120),
    });

    // the database changed outside the app: maybe Aria started or finished editing this note
    this.externalSub = this.noteService.externalChange$.subscribe(() => void this.checkAria());

    this.noteSub = this.modelService.currentNote$.subscribe((note: Note | null) => {
      if (note) {
        const switched = note.id !== this.currentNote?.id;
        // the note you leave is written now, not after its autosave timer
        if (switched) void this.noteService.flushSaves();
        this.currentNote = note;
        // Only reload when the content differs: this also fires on every keystroke,
        // and resetting identical content would move the cursor.
        if ((note.content ?? '') !== this.editor.getHTML()) {
          this.editor.commands.setContent(note.content ?? '', { emitUpdate: false });
        }
        if (switched) {
          this.closeSlash();
          this.linkEditing = false;
          this.closeFind(false);
          void this.checkAria();
        }
      } else {
        this.currentNote = null;
        this.editor.commands.clearContent(false);
      }
      this.tellOpenNote(note?.id ?? null);
      this.words = this.countWords();
      this.refreshOutline();
    });
  }

  ngOnDestroy(): void {
    this.noteSub?.unsubscribe();
    this.externalSub?.unsubscribe();
    clearTimeout(this.ariaTimer);
    this.tellOpenNote(null);
    this.floatWatch.disconnect();
    this.editor?.destroy();
  }

  // ── Aria ──

  /** Aria asks MyNotion which note "this note" is. */
  private tellOpenNote(id: number | null) {
    if (id === this.sentOpenNote) return;
    this.sentOpenNote = id;
    void window.electronAPI?.aria?.setOpenNote(id);
  }

  /** Locks the note while Aria reworks it, and unlocks it (with her version loaded) when she's done. */
  async checkAria() {
    clearTimeout(this.ariaTimer);
    let busy: number | null = null;
    try { busy = (await window.electronAPI?.aria?.editing()) ?? null; } catch { busy = null; }
    const locked = busy !== null && busy === this.currentNote?.id;
    if (locked !== this.ariaEditing) {
      this.ariaEditing = locked;
      // false: no "update" event, which would save the old text over Aria's and count as you typing
      this.editor?.setEditable(!locked, false);
      if (!locked) this.loadAriaVersion();
      this.cdr.detectChanges();
    }
    // the database watcher tells us when she's done; this is in case a change slips past it
    if (locked) this.ariaTimer = setTimeout(() => this.zone.run(() => void this.checkAria()), 3000);
  }

  /** Aria is done: show her version of the note (the notes were just reloaded from the database). */
  private loadAriaVersion() {
    const note = this.currentNote;
    const fresh = note?.id != null ? this.noteService.getNotesCache().find(n => n.id === note.id) : undefined;
    if (note && fresh && (fresh.content ?? '') !== (note.content ?? '')) {
      this.modelService.updateCurrentNote({ ...note, title: fresh.title, content: fresh.content });
    }
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
  sub = (e: Editor) => e.chain().focus().toggleSubscript().run();
  sup = (e: Editor) => e.chain().focus().toggleSuperscript().run();

  // ── tables: a small bar above the table the cursor is in (add / remove rows and columns) ──

  /** where that bar is, relative to .editor-main; null when the cursor isn't in a table */
  tableBar: { rows: number; cols: number; top: number; left: number } | null = null;

  private placeTableBar() {
    const info = this.editor && tableInfo(this.editor.state);
    const el = info && (this.editor.view.nodeDOM(info.pos) as HTMLElement | null);
    const main = this.host.nativeElement.querySelector('.editor-main') as HTMLElement | null;
    if (!info || !el || !main) { this.tableBar = null; return; }
    const box = el.getBoundingClientRect(), area = main.getBoundingClientRect();
    if (box.bottom < area.top + 44 || box.top > area.bottom) { this.tableBar = null; return; }
    // next to the table's top right corner when there's room (so it covers nothing), else just above it;
    // while the table's top is scrolled away, it stays at the top of the page
    const page = (main.querySelector('.content-text') as HTMLElement).getBoundingClientRect();
    const table = (el.querySelector('table') ?? el).getBoundingClientRect();   // (el: the full-width wrapper)
    const beside = Math.min(table.right, box.right) + 10;
    const fits = beside + 200 <= page.right - 12;
    this.tableBar = { rows: info.rows, cols: info.cols,
      top: Math.max(4, box.top - area.top - (fits ? 0 : 40)),
      left: fits ? beside - area.left : Math.max(4, box.left - area.left) };
  }

  tableDo(what: 'rowAfter' | 'rowBefore' | 'colAfter' | 'colBefore' | 'delRow' | 'delCol' | 'header' | 'delete') {
    const c = this.editor.chain().focus();
    ({
      rowAfter: () => c.addRowAfter(), rowBefore: () => c.addRowBefore(),
      colAfter: () => c.addColumnAfter(), colBefore: () => c.addColumnBefore(),
      // the last row / column: the whole table goes
      delRow: () => (this.tableBar!.rows > 1 ? c.deleteRow() : c.deleteTable()),
      delCol: () => (this.tableBar!.cols > 1 ? c.deleteColumn() : c.deleteTable()),
      header: () => c.toggleHeaderRow(), delete: () => c.deleteTable(),
    })[what]().run();
  }
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
    const id = noteIdOf(href);
    if (id !== null) this.openNote(id);
    else if (href) window.open(href, '_blank', 'noopener');
  }

  /** Opens a linked note (the current one is saved as you type, so nothing is lost). */
  async openNote(id: number) {
    let note = this.noteService.getNotesCache().find(n => n.id === id);
    if (!note) { await this.noteService.loadNotes(); note = this.noteService.getNotesCache().find(n => n.id === id); }
    if (note) this.modelService.onNoteClicked(note);
    else this.say('That note doesn\'t exist any more.');
  }

  /** "Select text, ask Aria": her card opens under the selection (aria-edit/). */
  askAria() {
    this.ariaEdit?.openMenu();
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
    // "[[" + part of a title: the notes to link to, in the same menu
    const link = /\[\[([^[\]\n]{0,40})$/.exec(before);
    if (link) {
      const notes = matchNotes(this.noteService.getNotesCache(), link[1], this.currentNote?.id);
      if (!notes.length) return this.closeSlash();
      this.slashFrom = $from.pos - link[1].length - 2;
      if (!this.slashOpen || link[1] !== this.slashQuery) this.slashIndex = 0;
      this.slashQuery = link[1];
      this.slashItems = notes.map(n => ({
        id: 'note:' + n.id, label: n.title, description: 'Link to this note (click the link to open it)', hint: '', keywords: '',
        run: (e: Editor) => e.chain().focus().insertContent([
          { type: 'text', text: n.title, marks: [{ type: 'link', attrs: { href: noteHref(n.id!) } }] },
          { type: 'text', text: ' ' },
        ]).run(),
      }));
      this.slashOpen = true;
      this.placeSlash();
      return;
    }
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
    if (item.id === 'image') this.pickImage();
    if (item.id === 'vector') this.openGrid([blankMatrix(3, 1)], [], 'block', this.editor.state.selection.from, true);
    if (item.id === 'matrix') this.openGrid([blankMatrix(2, 2)], [], 'block', this.editor.state.selection.from, true);
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

  /** Where a box opens: under the formula (or the cursor for a new one), kept inside the editor. */
  private boxAt(pos: number, isNew: boolean, width: number) {
    const box = this.host.nativeElement.getBoundingClientRect();
    const dom = isNew ? null : this.editor.view.nodeDOM(pos) as HTMLElement | null;
    const r = dom?.getBoundingClientRect() ?? this.editor.view.coordsAtPos(pos);
    return { top: r.bottom - box.top + 8, above: r.top - box.top - 8,
             left: Math.max(8, Math.min(r.left - box.left, box.width - width - 10)) };
  }

  /** The open formula or matrix box, kept on screen: under its formula if it fits, else above it, else as low as it
   *  fits (too tall for the window: it scrolls inside). Runs again whenever the box or the window changes size. */
  private floatEl?: HTMLElement;
  private floatWatch = new ResizeObserver(() => this.fitBox());
  @ViewChild('floatBox') set floatBox(ref: ElementRef<HTMLElement> | undefined) {
    if (ref?.nativeElement === this.floatEl) return;
    if (this.floatEl) this.floatWatch.unobserve(this.floatEl);
    this.floatEl = ref?.nativeElement;
    if (this.floatEl) { this.floatWatch.observe(this.floatEl); this.floatWatch.observe(this.host.nativeElement); this.fitBox(); }
  }

  private fitBox() {
    const el = this.floatEl, at = this.grid ?? this.math, gap = 8;
    if (!el || !at) return;
    const { clientHeight: H, clientWidth: W } = this.host.nativeElement, h = el.offsetHeight, w = el.offsetWidth;
    if (at.dragged) {                                        // moved by hand: it stays there, just kept on screen
      el.style.top = `${Math.max(gap, Math.min(at.top, H - h - gap))}px`;
      el.style.left = `${Math.max(gap, Math.min(at.left, W - w - gap))}px`;
      return;
    }
    const scroller = this.host.nativeElement.querySelector('.content-text') as HTMLElement | null;
    if (scroller && at.top + h > H - gap && at.above - h < gap) {   // fits neither way: scroll the note up to make room
      const pageTop = scroller.getBoundingClientRect().top - this.host.nativeElement.getBoundingClientRect().top;
      const before = scroller.scrollTop;
      scroller.scrollTop += Math.min(at.top + h - (H - gap), at.above - pageTop - 16);   // the line itself stays in sight
      const moved = scroller.scrollTop - before;
      at.top -= moved;
      at.above -= moved;
    }
    let top = at.top;
    if (top + h > H - gap) top = at.above - h >= gap ? at.above - h : Math.max(gap, H - h - gap);
    el.style.top = `${top}px`;
    el.style.left = `${Math.max(gap, Math.min(at.left, W - w - gap))}px`;
  }

  private spotOf(b: { top: number; left: number; above: number; dragged?: boolean }) {
    return { top: b.top, left: b.left, above: b.above, dragged: b.dragged };
  }

  /** Drag the formula or matrix box by its grip (or its empty edge) to anywhere in the editor. */
  startDrag(e: PointerEvent) {
    const el = this.floatEl, at = this.grid ?? this.math, target = e.target as HTMLElement;
    if (!el || !at || e.button !== 0 || !(target === el || target.closest('.box-grip'))) return;
    e.preventDefault();                                      // the cell or text box being typed in keeps the cursor
    const startX = e.clientX, startY = e.clientY, top = el.offsetTop, left = el.offsetLeft;
    el.classList.add('dragging');
    const move = (ev: PointerEvent) => {
      at.top = top + ev.clientY - startY;
      at.left = left + ev.clientX - startX;
      at.dragged = true;
      this.fitBox();
    };
    const stop = () => {
      el.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      const { top: t, left: l } = el.style;                  // what's on screen (kept inside the editor)
      at.top = parseFloat(t) || at.top;
      at.left = parseFloat(l) || at.left;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  openMath(type: 'inline' | 'block', pos: number, latex: string, isNew = false) {
    const chain = isNew ? null : fromChain(latex ?? '');
    if (chain) return this.openGrid(chain.items, chain.ops, type, pos, false);   // only matrices: opens as the grid
    this.math = { type, pos, latex: latex ?? '', original: latex ?? '', isNew, align: this.alignAt(pos, isNew), ...this.boxAt(pos, isNew, 370) };
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
    this.mathMatrices = findMatrices(this.math.latex);
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
    input.value = this.math.latex;     // in the box now (ngModel would only write it a moment later), so the
    input.focus();                     // placeholder can be selected right away
    input.setSelectionRange(cursor, cursor + (sn.sel ?? 0));   // typing replaces it (the "a" of a/b, the "v" of v⃗)
    this.renderMathPreview();
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
    if (m.type === 'block' && latex) this.alignBlockNear(m.pos, m.align ?? 'left');
  }

  /** After a new block formula the cursor goes to the line below it; left selected, the next key would replace it. */
  private cursorBelowBlock(near: number) {
    const { doc } = this.editor.state;
    const at = this.nearestBlockMath(near);
    if (at < 0) return;
    const end = at + doc.nodeAt(at)!.nodeSize;
    const next = doc.resolve(end).nodeAfter;
    if (next?.isTextblock) {
      this.editor.chain().focus().setTextSelection(end + 1).run();
    } else {
      this.editor.chain().focus().insertContentAt(end, { type: 'paragraph' }).setTextSelection(end + 1).run();
    }
  }

  /** Where the block formula closest to `near` starts (-1 if there is none). */
  private nearestBlockMath(near: number): number {
    let at = -1;
    this.editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'blockMath' && (at < 0 || Math.abs(pos - near) < Math.abs(at - near))) at = pos;
      return node.type.name !== 'blockMath';
    });
    return at;
  }

  private alignBlockNear(near: number, align: Align) {
    const at = this.nearestBlockMath(near);
    if (at >= 0 && this.editor.state.doc.nodeAt(at)?.attrs['align'] !== align) {
      this.editor.view.dispatch(this.editor.state.tr.setNodeAttribute(at, 'align', align));
    }
  }

  /** The alignment of an existing block formula (a new one starts left). */
  private alignAt(pos: number, isNew: boolean): Align {
    const node = isNew ? null : this.editor.state.doc.nodeAt(pos);
    return node?.type.name === 'blockMath' ? (node.attrs['align'] || 'left') : 'left';
  }

  /** Toolbar: left / centre / right for the line the cursor is in (or a selected formula on its own line). */
  setAlign(align: Align) {
    const sel = this.editor.state.selection;
    if (sel instanceof NodeSelection && ['blockMath', 'image'].includes(sel.node.type.name)) {
      this.editor.view.dispatch(this.editor.state.tr.setNodeAttribute(sel.from, 'align', align));
    } else {
      this.editor.chain().focus().setTextAlign(align).run();
    }
  }

  alignActive(align: Align): boolean {
    const sel = this.editor?.state.selection;
    if (sel instanceof NodeSelection && ['blockMath', 'image'].includes(sel.node.type.name)) return (sel.node.attrs['align'] || 'left') === align;
    const set = ['center', 'right'].find(a => this.editor?.isActive({ textAlign: a }));
    return (set ?? 'left') === align;
  }

  /** The alignment buttons in the formula and matrix boxes (formulas on their own line). */
  setBoxAlign(align: Align) {
    if (this.grid) this.grid.align = align;
    else if (this.math) this.math.align = align;
  }

  cancelMath() {
    const m = this.math;
    if (!m) return;
    this.math = null;
    this.editor.commands.focus();          // nothing was inserted for a new one, nothing changes for an old one
  }

  /** A click anywhere outside the formula or matrix box saves it (an empty one is removed). */
  @HostListener('document:mousedown', ['$event'])
  onDocMouseDown(e: MouseEvent) {
    const inside = (e.target as HTMLElement)?.closest?.('.math-box, .matrix-box');
    if (this.grid && !inside) this.saveGrid();
    else if (this.math && !inside) this.saveMath();
  }

  // ── matrices ──
  // The grid box edits one matrix at a time; a formula can hold several joined by + − · × = (tabs at the top).
  // `type`: in the text (inline) or on its own line (block); changing it moves an existing formula over.

  openGrid(items: Matrix[], ops: string[], type: 'inline' | 'block', pos: number, isNew: boolean, into?: GridTarget) {
    this.grid = { items, ops, cur: 0, type, origType: type, pos, isNew, into, align: into?.math.align ?? this.alignAt(pos, isNew),
                  ...(into ? { top: into.math.top, left: into.math.left, above: into.math.above, dragged: into.math.dragged } : this.boxAt(pos, isNew, 400)) };
    this.afterGridChange(0, 0);
  }

  /** The formula box's Matrix button: build one in the grid, then it goes into the formula at the cursor. */
  matrixFromMathBox(rows = 2, cols = 2) {
    const m = this.math, input = this.mathInput?.nativeElement;
    if (!m) return;
    const at = input?.selectionStart ?? m.latex.length;
    this.math = null;
    this.openGrid([blankMatrix(rows, cols)], [], m.type, m.pos, m.isNew, { math: m, at, end: input?.selectionEnd ?? at });
  }

  /** "Matrix 2" in the formula box: that one matrix in the grid; the rest of the formula stays as it is. */
  editMatrixInFormula(i: number) {
    const m = this.math, found = this.mathMatrices[i];
    if (!m || !found) return;
    this.math = null;
    this.openGrid([found.m], [], m.type, m.pos, m.isNew, { math: m, at: found.start, end: found.end });
  }

  get gm(): Matrix { return this.grid!.items[this.grid!.cur]; }
  get gridRows() { return this.grid ? this.gm.cells.length : 0; }
  get gridCols() { return this.grid ? this.gm.cells[0]?.length ?? 0 : 0; }

  private setGm(m: Matrix) { this.grid!.items = this.grid!.items.map((x, i) => (i === this.grid!.cur ? m : x)); }

  setKind(kind: MatrixKind) {
    if (!this.grid) return;
    this.setGm({ ...this.gm, kind });
    this.renderGridPreview();
  }

  /** The vertical line: after which column (0 = none). */
  setGridBar(after: number) {
    if (!this.grid) return;
    this.setGm(setBar(this.gm, after || undefined));
    this.renderGridPreview();
  }

  get barChoices(): number[] {
    return Array.from({ length: Math.max(0, this.gridCols - 1) }, (_, i) => i + 1);
  }

  resizeGrid(rows: number, cols: number) {
    if (!this.grid) return;
    this.setGm(resize(this.gm, rows, cols));
    this.afterGridChange(rows > this.gridRows ? Math.min(rows, MAX_SIZE) - 1 : 0, 0);
  }

  setCell(r: number, c: number, value: string) {
    if (!this.grid) return;
    this.gm.cells[r][c] = value;
    this.renderGridPreview();
  }

  /** The tabs: which matrix of the formula is being filled in. */
  pickMatrix(i: number) {
    if (!this.grid) return;
    this.grid.cur = i;
    this.afterGridChange(0, 0);
  }

  /** "+ matrix": another one after the current, same size, joined with + (changeable). */
  addMatrix() {
    const g = this.grid;
    if (!g) return;
    const fresh = blankMatrix(this.gridRows, this.gridCols, this.gm.kind);
    g.items = [...g.items.slice(0, g.cur + 1), fresh, ...g.items.slice(g.cur + 1)];
    g.ops = [...g.ops.slice(0, g.cur), '+', ...g.ops.slice(g.cur)];
    g.cur++;
    this.afterGridChange(0, 0);
  }

  removeMatrix() {
    const g = this.grid;
    if (!g || g.items.length < 2) return;
    g.items = g.items.filter((_, i) => i !== g.cur);
    g.ops = g.ops.filter((_, i) => i !== Math.max(0, g.cur - 1));
    g.cur = Math.max(0, g.cur - 1);
    this.afterGridChange(0, 0);
  }

  setOp(i: number, op: string) {
    if (!this.grid) return;
    this.grid.ops = this.grid.ops.map((o, j) => (j === i ? op : o));
    this.renderGridPreview();
  }

  setGridType(type: 'inline' | 'block') {
    if (!this.grid) return;
    this.grid.type = type;
    this.renderGridPreview();
  }

  /** Re-render the preview and put the cursor in a box (the first box of a new row, or the top-left). */
  private afterGridChange(r: number, c: number) {
    setTimeout(() => {
      this.renderGridPreview();
      (this.host.nativeElement.querySelector(`.matrix-cell[data-r="${r}"][data-c="${c}"]`) as HTMLInputElement | null)?.focus();
    }, 0);
  }

  private gridLatex(trim = false): string {
    const g = this.grid!;
    return chainToLatex(trim ? g.items.map(trimmed) : g.items, g.ops);
  }

  renderGridPreview() {
    const el = this.gridPreview?.nativeElement;
    if (el && this.grid) katex.render(this.gridLatex(), el, { throwOnError: false, displayMode: true });
  }

  onGridKey(e: KeyboardEvent, r: number, c: number) {
    const move = (dr: number, dc: number) => {
      const cell = this.host.nativeElement.querySelector(`.matrix-cell[data-r="${r + dr}"][data-c="${c + dc}"]`) as HTMLInputElement | null;
      if (cell) { e.preventDefault(); cell.focus(); cell.select(); }
    };
    if (e.key === 'Enter') { e.preventDefault(); this.saveGrid(); }
    else if (e.key === 'Escape') { e.preventDefault(); this.cancelGrid(); }
    else if (e.key === 'ArrowUp') move(-1, 0);
    else if (e.key === 'ArrowDown') move(1, 0);
    else if (e.key === 'ArrowLeft' && (e.target as HTMLInputElement).selectionStart === 0) move(0, -1);
    else if (e.key === 'ArrowRight' && (e.target as HTMLInputElement).selectionEnd === (e.target as HTMLInputElement).value.length) move(0, 1);
  }

  saveGrid() {
    const g = this.grid;
    if (!g) return;
    const empty = g.items.every(m => m.cells.every(row => row.every(c => !c.trim())));
    const latex = this.gridLatex(true);
    this.grid = null;
    if (g.into) {                                                // back into the formula it came from
      const m = g.into.math;
      if (!empty) m.latex = m.latex.slice(0, g.into.at) + latex + m.latex.slice(g.into.end);
      this.math = { ...m, ...this.spotOf(g) };                   // the formula box comes back where the grid was
      const cursor = empty ? g.into.at : g.into.at + latex.length;
      setTimeout(() => {
        this.renderMathPreview();
        this.mathInput?.nativeElement.focus();
        this.mathInput?.nativeElement.setSelectionRange(cursor, cursor);
      }, 0);
      return;
    }
    if (g.isNew && empty) return this.cancelGrid();
    if (!g.isNew && g.type !== g.origType && !empty) return this.moveFormula(g.pos, g.type, latex, g.align);
    this.math = { type: g.type, pos: g.pos, latex, original: '', isNew: g.isNew, top: g.top, left: g.left, above: g.above, align: g.align, dragged: g.dragged };
    this.saveMath();
  }

  /** In the text <-> own line: the formula is replaced by one of the other kind in the same place. */
  private moveFormula(pos: number, to: 'inline' | 'block', latex: string, align: Align) {
    const node = this.editor.state.doc.nodeAt(pos);
    if (!node) return;
    const range = { from: pos, to: pos + node.nodeSize };
    if (to === 'inline') {
      this.editor.chain().focus().insertContentAt(range, { type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex } }] }).run();
    } else {
      this.editor.chain().focus().insertContentAt(range, { type: 'blockMath', attrs: { latex, align } }).run();
    }
  }

  cancelGrid() {
    const g = this.grid;
    if (!g) return;
    this.grid = null;
    if (g.into) {
      this.math = { ...g.into.math, ...this.spotOf(g) };
      setTimeout(() => { this.renderMathPreview(); this.mathInput?.nativeElement.focus(); }, 0);
    } else {
      this.editor.commands.focus();
    }
  }

  /** "Edit as LaTeX": the same formula in the normal formula box. */
  gridAsLatex() {
    const g = this.grid;
    if (!g || g.into) return;
    this.grid = null;
    this.math = { type: g.type, pos: g.pos, latex: this.gridLatex(true), original: '', isNew: g.isNew, top: g.top, left: g.left, above: g.above, align: g.align, dragged: g.dragged };
    setTimeout(() => { this.renderMathPreview(); this.mathInput?.nativeElement.focus(); }, 0);
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

  // ── find & replace ──

  get findInfo() { return findState(this.editor.state); }

  @HostListener('document:keydown', ['$event'])
  onFindKeys(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !this.currentNote) return;
    const key = e.key.toLowerCase();
    if (!e.shiftKey && (key === 'f' || key === 'h')) {      // (Ctrl+Shift+H stays the yellow marker)
      e.preventDefault();
      this.openFind(key === 'h');
    }
  }

  /** Opens the bar (with the selected words in it, if any) and searches from the cursor. */
  openFind(replace = false) {
    const { from, to, empty } = this.editor.state.selection;
    const picked = empty ? '' : this.editor.state.doc.textBetween(from, to, ' ');
    if (picked && !picked.includes('\n') && picked.length <= 200) this.findQuery = picked;
    this.findOpen = true;
    this.findReplace = this.findReplace || replace;
    this.runFind();
    this.cdr.detectChanges();          // the box exists now, so what's typed next goes into it, not the note
    this.findInput?.nativeElement.focus();
    this.findInput?.nativeElement.select();
  }

  runFind() {
    this.editor.commands.setFind(this.findQuery, this.findCase);
    this.showMatch();
  }

  findStep(dir: 1 | -1) {
    if (!this.findInfo.matches.length) return;
    this.editor.commands.findStep(dir);
    this.showMatch();
  }

  replaceOne() {
    this.editor.commands.replaceCurrent(this.replaceWith);
    this.showMatch();
  }

  replaceEvery() {
    this.editor.commands.replaceAll(this.replaceWith);
  }

  toggleFindCase() {
    this.findCase = !this.findCase;
    this.runFind();
  }

  /** Esc: the bar closes and the cursor is left on the match you were at (keep typing from there). */
  closeFind(focus = true) {
    if (!this.findOpen) return;
    this.findOpen = false;
    this.editor.commands.clearFind();
    if (focus) this.editor.commands.focus(undefined, { scrollIntoView: false });
  }

  onFindKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); this.findStep(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); this.closeFind(); }
  }

  onReplaceKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); (e.ctrlKey || e.metaKey) ? this.replaceEvery() : this.replaceOne(); }
    else if (e.key === 'Escape') { e.preventDefault(); this.closeFind(); }
  }

  /** The current match: a folded toggle around it opens, and the page scrolls so it's in the middle. */
  private showMatch() {
    const s = this.findInfo, m = s.matches[s.current];
    if (!m) return;
    const $m = this.editor.state.doc.resolve(m.from);
    const tr = this.editor.state.tr;
    for (let d = $m.depth; d > 0; d--) {
      const node = $m.node(d);
      if (node.type.name === 'details' && !node.attrs['open']) tr.setNodeAttribute($m.before(d), 'open', true);
    }
    if (tr.docChanged || tr.steps.length) this.editor.view.dispatch(tr);
    setTimeout(() => {
      const scroller = this.host.nativeElement.querySelector('.content-text') as HTMLElement | null;
      const hit = this.host.nativeElement.querySelector('.find-hit.current') as HTMLElement | null;
      if (!scroller || !hit) return;
      const r = hit.getBoundingClientRect(), box = scroller.getBoundingClientRect();
      if (r.top < box.top + 40 || r.bottom > box.bottom - 40) scroller.scrollTop += r.top - box.top - box.height / 2;
    }, 0);
  }

  // ── pictures ──

  @ViewChild('imageInput') imageInput?: ElementRef<HTMLInputElement>;
  readonly imageTypes = ACCEPTED.join(',');
  imageNote = '';                  // "Adding picture…" or what went wrong, shown in the footer
  private imageNoteTimer?: ReturnType<typeof setTimeout>;

  /** Toolbar picture button and /image: the file picker. */
  pickImage() {
    const input = this.imageInput?.nativeElement;
    if (!input) return;
    input.value = '';
    input.click();
  }

  onImagePicked(input: HTMLInputElement) {
    const files = imageFiles(input.files);
    if (files.length) this.addImages(files);
    else if (input.files?.length) this.say('Only PNG, JPEG, GIF and WebP pictures can go into a note.');
  }

  /** Stores the pictures and puts them in the note at `at` (default: the cursor), one after the other. */
  async addImages(files: File[], at?: number) {
    if (!this.currentNote) return;
    const noteId = this.currentNote.id;
    this.say(files.length > 1 ? `Adding ${files.length} pictures…` : 'Adding picture…', false);
    let pos = at ?? this.editor.state.selection.from;
    let failed = '';
    for (const file of files) {
      try {
        const saved = await window.electronAPI.images.save(await prepareImage(file));
        if (!saved.ok) { failed = saved.error; continue; }
        if (this.currentNote?.id !== noteId) return;        // switched notes meanwhile: don't put it in the other one
        const before = this.editor.state.doc.content.size;
        this.editor.chain().focus().insertContentAt(Math.min(pos, before), { type: 'image', attrs: { src: saved.url, alt: file.name } }).run();
        pos = this.cursorAfterImage();                       // typing goes under it (not over it); the next one goes there
      } catch {
        failed = 'The picture could not be added.';
      }
    }
    this.say(failed);
  }

  /** After a picture goes in it is selected, so the next key would replace it: the cursor moves to the line under
   *  it instead: an empty line there, or a new one (so what you type isn't glued to the next line). */
  private cursorAfterImage(): number {
    const { state } = this.editor;
    const sel = state.selection;
    const img = sel instanceof NodeSelection && sel.node.type.name === 'image' ? sel : null;
    if (!img) return sel.to;
    const end = img.from + img.node.nodeSize;
    const next = state.doc.resolve(end).nodeAfter;
    if (next?.isTextblock && next.content.size === 0) {        // an empty line is already there
      this.editor.commands.setTextSelection(end + 1);
    } else {
      this.editor.chain().insertContentAt(end, { type: 'paragraph' }).setTextSelection(end + 1).run();
    }
    return this.editor.state.selection.from;
  }

  /** A short line in the footer (gone after a few seconds unless `stay`). */
  // ── Save as PDF (the footer button) ──

  exporting = false;
  lastPdf = '';                    // the PDF just saved, for "Show"

  async exportPdf() {
    if (!this.currentNote || this.exporting) return;
    this.exporting = true;
    this.lastPdf = '';
    this.say('Making the PDF…', false);
    try {
      const res = await window.electronAPI.notes.exportPdf(this.currentNote.title ?? '', printableHtml(this.editor.view.dom),
        katexCss(), document.baseURI);
      if (res.ok && res.path) {
        this.say('Saved as ' + res.path.split(/[\\/]/).pop());
        this.lastPdf = res.path;
      } else {
        this.say(res.canceled ? '' : res.error ?? 'The PDF could not be saved.');
      }
    } catch {
      this.say('The PDF could not be saved.');
    } finally {
      this.exporting = false;
    }
  }

  showPdf() {
    if (this.lastPdf) window.electronAPI.notes.showPdf(this.lastPdf);
  }

  private say(text: string, fade = true) {
    clearTimeout(this.imageNoteTimer);
    this.imageNote = text;
    this.lastPdf = '';               // ("Show" belongs to the PDF message only)
    if (text && fade) this.imageNoteTimer = setTimeout(() => (this.imageNote = ''), 6000);
  }

  // ── outline ──

  private refreshOutline() {
    const next = this.editor ? outlineOf(this.editor.state.doc) : [];
    const same = next.length === this.outline.length &&
      next.every((h, i) => h.text === this.outline[i].text && h.level === this.outline[i].level && h.pos === this.outline[i].pos);
    if (!same) this.outline = next;
    if (this.outlineOn) setTimeout(() => this.onPageScroll(), 0);
  }

  /** The study scene: off → small window in the corner → behind the note → off. */
  setScene(mode: SceneMode) {
    this.scene = mode;
    try { localStorage.setItem(SCENE_KEY, mode); } catch { /* not saved, fine */ }
  }

  nextScene() {
    this.setScene(SCENE_NEXT[this.scene]);
  }

  toggleOutline() {
    this.outlineOn = !this.outlineOn;
    try { localStorage.setItem(OUTLINE_KEY, this.outlineOn ? 'on' : 'off'); } catch { /* not saved, fine */ }
    if (this.outlineOn) setTimeout(() => this.onPageScroll(), 0);
  }

  /** Which heading you're reading: the last one that has passed the top quarter of the page. */
  onPageScroll() {
    if (this.tableBar) this.placeTableBar();
    if (!this.outlineOn || !this.outline.length) return;
    const scroller = this.host.nativeElement.querySelector('.content-text') as HTMLElement | null;
    if (!scroller) return;
    const line = scroller.getBoundingClientRect().top + scroller.clientHeight / 4;
    const tops = this.outline.map(h => (this.editor.view.nodeDOM(h.pos) as HTMLElement | null)?.getBoundingClientRect().top ?? Infinity);
    const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
    this.outlineActive = atEnd ? tops.filter(t => t < Infinity).length - 1 : activeHeading(tops, line);
  }

  /** Click a heading: the page scrolls it to the top and the cursor goes to its end. */
  jumpTo(h: OutlineItem) {
    const el = this.editor.view.nodeDOM(h.pos) as HTMLElement | null;
    const scroller = this.host.nativeElement.querySelector('.content-text') as HTMLElement | null;
    if (!el || !scroller) return;
    scroller.scrollTo({ top: scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16, behavior: 'smooth' });
    const node = this.editor.state.doc.nodeAt(h.pos);
    if (node) this.editor.chain().setTextSelection(h.pos + node.nodeSize - 1).focus(undefined, { scrollIntoView: false }).run();
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
