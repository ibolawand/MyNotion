import { Component, OnInit, OnDestroy, ElementRef, ViewChild, NgZone } from '@angular/core';
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
  { id: 'divider', label: 'Divider', description: 'A line between sections', hint: '---', keywords: 'hr rule separator line',
    run: e => e.chain().focus().setHorizontalRule().run() },
  { id: 'date', label: 'Today\'s date', description: 'Inserts the date', hint: '', keywords: 'date today time now',
    run: e => e.chain().focus().insertContent(new Date().toLocaleDateString(undefined,
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' ').run() },
];

const FONT_KEY = 'mynotion.editorFont';

@Component({
  selector: 'text-editor',
  standalone: true,
  imports: [FormsModule, TiptapEditorDirective, TiptapBubbleMenuDirective],
  templateUrl: './text-editor.html',
  styleUrls: ['./text-editor.css', './note-content.css']
})
export class TextEditor implements OnInit, OnDestroy {
  @ViewChild('linkInput') linkInput?: ElementRef<HTMLInputElement>;
  @ViewChild('slashMenu') slashMenuEl?: ElementRef<HTMLElement>;

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
    if (editor.isActive('codeBlock')) return false;
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
    // match the start of a word ("to" -> To-do, Today's date; not "separator"); label matches first
    const starts = (text: string) => text.toLowerCase().split(/[\s-']+/).some(w => w.startsWith(query));
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
