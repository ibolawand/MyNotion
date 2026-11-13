import { Component, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { Category, Folder, Note } from '../../model/models';
import { NoteService } from '../../services/NoteService';
import { ModelService } from '../model.service';
import { Editor } from '../editor/editor';
import { Section, contentsOf, edited, latestNote } from '../shelf/shelf-model';

/** An opened book: its contents on the left page (the folder's notes, subfolders as sections), the note on the
 *  right page in the normal editor. The book's name, colour and its categories are changed here too. */
@Component({
  selector: 'app-open-book',
  standalone: true,
  imports: [AsyncPipe, FormsModule, Editor],
  templateUrl: './open-book.html',
  styleUrl: './open-book.css',
})
export class OpenBook implements OnInit, OnDestroy {
  book: Folder | null = null;
  sections: Section[] = [];
  current: Note | null = null;
  categories: Category[] = [];
  name = '';
  collapsed = false;
  menuOpen = false;
  newCategory = '';
  readonly colours = ['#4ade80', '#3b82f6', '#a855f7', '#ef4444', '#f59e0b', '#ec4899', '#06b6d4', '#9ca3af'];
  readonly edited = edited;

  private bookId: number | null = null;
  private notes: Note[] = [];
  private folders: Folder[] = [];
  private foldersLoaded = false;
  private picked: number | null = null;       // the book whose first note was already chosen
  private closing = false;
  private subs: Subscription[] = [];
  private timers: any[] = [];
  private shutting: Promise<void> | null = null;
  private readonly closer = () => this.shut();

  constructor(public modelService: ModelService, private noteService: NoteService, private host: ElementRef<HTMLElement>,
              private zone: NgZone) {}

  async ngOnInit() {
    this.subs.push(
      this.modelService.openBookId$.subscribe(id => { this.bookId = id; this.menuOpen = false; this.refresh(); }),
      this.noteService.notes$.subscribe(list => { this.notes = list || []; this.refresh(); }),
      this.modelService.currentNote$.subscribe(note => { this.pageTurn(this.current, note); this.current = note; }),
      this.noteService.categories$.subscribe(list => this.categories = list || []),
      this.noteService.folderChanged$.subscribe(() => this.loadFolders()),
    );
    this.modelService.bookCloser = this.closer;
    await this.loadFolders();
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
    this.timers.forEach(clearTimeout);
    if (this.modelService.bookCloser === this.closer) this.modelService.bookCloser = null;
  }

  // ── a page turns, the book shuts ──────────────────────────────────────────────────────────────────────────────
  private q(sel: string): HTMLElement | null { return this.host.nativeElement.querySelector<HTMLElement>(sel); }
  private get still(): boolean { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; }

  /** A picture of the page as it is now (a copy of what the editor shows, scrolled the same). */
  private picture(into: HTMLElement) {
    const page = this.q('section.page-right');
    if (!page) return;
    into.replaceChildren(...Array.from(page.children).map(c => c.cloneNode(true)));
    const from = page.querySelectorAll('*'), to = into.querySelectorAll('*');
    if (from.length === to.length) from.forEach((el, i) => { if (el.scrollTop) to[i].scrollTop = el.scrollTop; });
  }

  private endTurn() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.q('.open-book')?.classList.remove('turning');
    this.q('.leaf')?.classList.remove('on', 'forward', 'back');
    this.q('.under')?.classList.remove('on');
    this.q('.leaf-front')?.replaceChildren();
    this.q('.under')?.replaceChildren();
  }

  /** Another note in the same book: the page turns, forwards to a note further down the contents, else back.
   *  Runs before the editor shows the new note, so the picture is still the old page. */
  private pageTurn(prev: Note | null, next: Note | null) {
    if (!prev || !next || prev.id == null || prev.id === next.id || this.closing || this.shutting) return;
    if (!this.book || this.book.id !== this.bookId || this.still) return;
    const root = this.q('.open-book'), leaf = this.q('.leaf'), front = this.q('.leaf-front'), under = this.q('.under');
    if (!root || !leaf || !front || !under) return;
    const order = this.sections.flatMap(s => s.notes).map(n => n.id);
    const to = next.id == null ? -1 : order.indexOf(next.id);
    const dir = to >= 0 && to < order.indexOf(prev.id) ? 'back' : 'forward';
    this.endTurn();
    root.classList.add('turning');
    leaf.classList.add('on', dir);
    if (dir === 'forward') this.picture(front);            // the old page lifts off the new one
    else { under.classList.add('on'); this.picture(under); }   // the old page stays until the new one lands on it
    this.zone.runOutsideAngular(() => {
      if (dir === 'back') this.timers.push(setTimeout(() => this.picture(front), 130));   // unseen until half way
      this.timers.push(setTimeout(() => this.endTurn(), 640));
    });
  }

  /** The right half folds over and the book gets small: then the shelf shows it going back to its place. */
  private shut(): Promise<void> {
    if (this.shutting) return this.shutting;
    const root = this.q('.open-book'), leaf = this.q('.leaf'), front = this.q('.leaf-front');
    if (!root || !leaf || !front || this.still || this.closing) return Promise.resolve();
    this.endTurn();
    root.classList.add('turning');
    leaf.classList.add('on');
    this.picture(front);
    root.classList.add('closing');
    return this.shutting = new Promise(resolve => this.zone.runOutsideAngular(() => this.timers.push(setTimeout(resolve, 470))));
  }

  private async loadFolders() {
    this.folders = (await this.noteService.loadFolders()) || [];
    this.foldersLoaded = true;
    this.refresh();
  }

  private refresh() {
    if (this.bookId == null || !this.foldersLoaded || this.closing) return;
    const book = this.folders.find(f => f.id === this.bookId) ?? null;
    if (!book) { void this.leave(); return; }          // deleted from outside (Aria, another window)
    if (this.book?.id !== book.id || document.activeElement?.classList.contains('book-title') !== true) this.name = book.name;
    this.book = book;
    this.sections = contentsOf(book.id, this.notes, this.folders);
    if (this.picked !== book.id) {
      this.picked = book.id;
      if (!this.modelService.isExistingNoteOpen.value) {
        const first = latestNote(this.sections);
        if (first) this.modelService.onNoteClicked(first);
      }
    }
  }

  /** What is being typed is written first, then the shelf comes back. */
  private async leave() {
    if (this.closing) return;
    this.closing = true;
    try { await this.noteService.flushSaves(); } finally { this.modelService.closeBook(); }
  }

  get empty(): boolean { return !this.sections.some(s => s.notes.length) && !this.isNew; }
  /** A note that was just started here and isn't saved yet: it isn't in the list, so it gets a row of its own. */
  get isNew(): boolean { return !!this.current && this.current.id == null && (this.modelService.isExistingNoteOpen.value); }
  isActive(note: Note): boolean { return !!this.current && this.current.id === note.id && this.modelService.isExistingNoteOpen.value; }
  categoryOf(note: Note): string { return this.categories.find(c => c.id === note.categoryID)?.name ?? ''; }

  select(note: Note) { if (!this.isActive(note)) this.modelService.onNoteClicked(note); }
  newNote() { this.modelService.toggleOpenNewNote(); }

  deleteNote(note: Note, event: Event) {
    event.stopPropagation();
    const wasOpen = this.isActive(note);
    this.noteService.deleteWithUndo(note);
    if (!wasOpen) return;
    const next = latestNote(contentsOf(this.book!.id, this.notes.filter(n => n.id !== note.id), this.folders));
    if (next) this.modelService.onNoteClicked(next);
    else this.modelService.isExistingNoteOpen.next(false);
  }

  async rename() {
    if (!this.book) return;
    const name = this.name.trim();
    if (!name) { this.name = this.book.name; return; }
    if (name !== this.book.name) this.book = await this.noteService.updateFolder({ ...this.book, name });
  }

  async recolour(colour: string) {
    if (this.book && colour !== this.book.colour) this.book = await this.noteService.updateFolder({ ...this.book, colour });
  }

  async deleteBook() {
    if (!this.book || !confirm(`Delete "${this.book.name}" and its notes?`)) return;
    this.closing = true;
    const book = this.book;
    await this.noteService.flushSaves();
    await this.noteService.deleteFolder(book);
    this.modelService.closeBook();
    this.noteService.notifyFolderChanged();
    await this.noteService.loadNotes();
  }

  async deleteSection(section: Section) {
    if (!confirm(`Delete the section "${section.folder.name}" and its notes?`)) return;
    await this.noteService.flushSaves();
    if (this.current && section.notes.some(n => n.id === this.current!.id)) this.modelService.isExistingNoteOpen.next(false);
    await this.noteService.deleteFolder(section.folder);
    this.noteService.notifyFolderChanged();
    await this.noteService.loadNotes();
  }

  addSection() { this.menuOpen = false; if (this.book) this.modelService.openFolderAdder(this.book.id); }

  async addCategory() {
    const name = this.newCategory.trim();
    if (!name) return;
    const created: any = await this.noteService.addCategory({ name, userID: this.noteService.getUserId() });
    if (created?.id !== undefined) this.noteService.notifyCategoriesChanged(created.id);
    this.newCategory = '';
    await this.noteService.loadCategories();
  }

  async deleteCategory(category: Category) {
    await this.noteService.deleteCategory(category.id);
    this.noteService.notifyCategoriesChanged(category.id);
    await this.noteService.loadCategories();
    await this.noteService.loadNotes();
  }
}
