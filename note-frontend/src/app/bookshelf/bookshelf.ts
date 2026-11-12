import { AfterViewInit, Component, ElementRef, HostListener, Inject, InjectionToken, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { Folder, Note } from '../../model/models';
import { NoteService } from '../../services/NoteService';
import { ModelService, descendantIds } from '../model.service';
import { Book, Shelf, buildShelf } from '../shelf/shelf-model';
import { SceneOptions, SceneRect, ShelfScene, plainText, startShelfScene } from './shelf-scene';

export type SceneFactory = (canvas: HTMLCanvasElement, shelf: Shelf, opts: SceneOptions) => ShelfScene;
/** How the shelf is drawn. null (or a machine without WebGL) = flat coloured books, same buttons. */
export const SHELF_SCENE = new InjectionToken<SceneFactory | null>('shelf scene', { providedIn: 'root', factory: () => startShelfScene });
const NOTE_DRAG = 'application/x-mynotion-note';

/** The home screen: the folders as books on a shelf, loose notes as slips on the desk, Aria's notes as a stack.
 *  three.js draws it (shelf-scene.ts); one invisible button lies over each book, slip and the stack, so clicks,
 *  the keyboard, screen readers and drag and drop are ordinary HTML. */
@Component({
  selector: 'app-bookshelf',
  standalone: true,
  templateUrl: './bookshelf.html',
  styleUrl: './bookshelf.css',
})
export class Bookshelf implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvas?: ElementRef<HTMLCanvasElement>;
  shelf: Shelf = { books: [], slips: [], aria: [] };
  flat = true;              // until the 3D scene is up
  fanned = false;
  leaving = false;          // a book is opening: the shelf fades
  loaded = false;
  private notes: Note[] = [];
  private folders: Folder[] = [];
  private rects = new Map<string, SceneRect>();
  private scene?: ShelfScene;
  private subs: Subscription[] = [];
  private observer?: ResizeObserver;

  constructor(private noteService: NoteService, public modelService: ModelService, private zone: NgZone,
              private host: ElementRef<HTMLElement>, @Inject(SHELF_SCENE) private makeScene: SceneFactory | null) {}

  async ngOnInit() {
    this.subs.push(
      this.noteService.notes$.subscribe(list => { this.notes = list || []; this.rebuild(); }),
      this.noteService.folderChanged$.subscribe(() => this.loadFolders()),
    );
    await this.loadFolders();
  }

  ngAfterViewInit() {
    queueMicrotask(() => this.startScene());
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.zone.run(() => { this.scene?.resize(); this.readRects(); }));
      this.observer.observe(this.host.nativeElement);
    }
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
    this.observer?.disconnect();
    this.scene?.dispose();
  }

  private async loadFolders() {
    this.folders = (await this.noteService.loadFolders()) || [];
    this.loaded = true;
    this.rebuild();
  }

  private rebuild() {
    this.shelf = buildShelf(this.notes, this.folders);
    if (!this.shelf.aria.length) this.fanned = false;
    this.scene?.update(this.shelf);
    this.readRects();
  }

  private startScene() {
    const canvas = this.canvas?.nativeElement;
    if (!canvas || !this.makeScene || this.scene) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const returnFrom = this.modelService.lastBookId;
    this.modelService.lastBookId = null;
    try {
      this.zone.runOutsideAngular(() => {
        this.scene = this.makeScene!(canvas, this.shelf, { still, returnFrom, onLayout: () => this.zone.run(() => this.readRects()) });
      });
      this.flat = false;
      this.readRects();
    } catch (e) {
      console.warn('Bookshelf: no 3D here, showing flat books', e);     // no WebGL: the flat shelf works the same
      this.scene = undefined;
      this.flat = true;
    }
  }

  private readRects() {
    this.rects = new Map((this.scene?.rects() ?? []).map(r => [r.key, r]));
  }

  /** Where the button for this book / slip lies over the picture (nothing in the flat shelf: CSS lays it out). */
  place(key: string): Record<string, string> | null {
    const r = this.flat ? undefined : this.rects.get(key);
    return r ? { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' } : null;
  }

  preview(note: Note): string { return plainText(note.content).slice(0, 90); }
  bookLabel(book: Book): string { return `Open ${book.folder.name}, ${book.count === 1 ? '1 note' : book.count + ' notes'}`; }

  hover(key: string | null) { if (!this.leaving) this.scene?.highlight(key); }

  async openBook(book: Book) {
    if (this.leaving) return;
    this.leaving = true;
    try { await this.scene?.open(book.folder.id); } catch { /* the book opens anyway */ }
    this.modelService.openBook(book.folder, descendantIds(book.folder.id, this.folders));
  }

  openNote(note: Note) { this.modelService.onNoteClicked(note); }

  toggleFan() {
    this.fanned = !this.fanned;
    this.scene?.fan(this.fanned);
    this.readRects();
  }

  /** Arrow keys walk along the books and slips; Enter and Space are the buttons' own. */
  @HostListener('keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && this.fanned) { this.toggleFan(); e.preventDefault(); return; }
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    const buttons = Array.from(this.host.nativeElement.querySelectorAll<HTMLButtonElement>('button.pick'));
    if (!buttons.length) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[at < 0 ? 0 : (at + step + buttons.length) % buttons.length].focus();
    e.preventDefault();
  }

  // a slip dragged onto a book moves into that folder
  dragStart(e: DragEvent, note: Note) {
    if (note.id == null) return;
    e.dataTransfer?.setData(NOTE_DRAG, String(note.id));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  dragOver(e: DragEvent, key: string) {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes(NOTE_DRAG)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.hover(key);
  }

  async drop(e: DragEvent, book: Book) {
    const id = Number(e.dataTransfer?.getData(NOTE_DRAG));
    const note = this.notes.find(n => n.id === id);
    this.hover(null);
    if (!note) return;
    e.preventDefault();
    await this.noteService.updateNote({ ...note, folderID: book.folder.id });
  }
}
