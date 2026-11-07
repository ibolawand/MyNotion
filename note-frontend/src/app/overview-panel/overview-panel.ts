import { Component, OnDestroy, OnInit } from '@angular/core';
import { NoteService } from '../../services/NoteService';
import { Category, Folder, Note } from '../../model/models';
import { BehaviorSubject, Subscription } from 'rxjs';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModelService } from '../model.service';

@Component({
  selector: 'app-overview-panel',
  imports: [
    AsyncPipe,
    FormsModule
  ],
  templateUrl: './overview-panel.html',
  styleUrl: './overview-panel.css'
})
export class OverviewPanel implements OnInit, OnDestroy {
  allNotes: Note[] = [];
  currentCategories: Category[] = [];
  currentFolder: Folder | null = null;
  currentFolderIds: number[] = [];
  newCategory: string = '';
  addCategoryWindow: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  openCategoryId: number | null = null;

  private subscriptions: Subscription[] = [];

  constructor(protected noteService: NoteService, public modelService: ModelService) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.getNotes();
      await this.noteService.loadCategories();

      this.subscriptions.push(
        this.noteService.notes$.subscribe(list => {
          this.allNotes = list || [];
        }),
        this.noteService.notesChanged$.subscribe(async () => {
          await this.getNotes();
        }),
        this.noteService.categories$.subscribe(list => {
          this.currentCategories = list || [];
        }),
        this.modelService.currentFolder$.subscribe(folder => {
          this.currentFolder = folder;
        }),
        this.modelService.currentFolderIds$.subscribe(ids => {
          this.currentFolderIds = ids || [];
        })
      );
    } catch (error) {
      console.error('OverviewPanel initialization error:', error);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  async getNotes(): Promise<void> {
    await this.noteService.loadNotes();
  }

  get filteredNotes(): Note[] {
    if (!this.currentFolderIds || this.currentFolderIds.length === 0) {
      return this.allNotes;
    }
    return this.allNotes.filter(n => n.folderID && this.currentFolderIds.includes(n.folderID));
  }

  /** When a note was last edited: "14:02" today, "Yesterday", "Tue", or "3 Nov". long: full date and time.
   *  SQLite's CURRENT_TIMESTAMP is UTC, written without a zone. */
  edited(note: Note, long = false): string {
    const raw = (note as any).updated_at || (note as any).created_at;
    if (!raw) return '';
    const d = new Date(String(raw).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? '' : 'Z'));
    if (isNaN(d.getTime())) return '';
    if (long) return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const now = new Date();
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((day(now) - day(d)) / 86400000);
    if (days <= 0) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  getNotesForCategory(categoryId: number): Note[] {
    return this.filteredNotes.filter(n => n.categoryID === categoryId);
  }

  toggleCategory(categoryId: number): void {
    this.openCategoryId = this.openCategoryId === categoryId ? null : categoryId;
  }

  openAddCategoryWindow(): void {
    this.addCategoryWindow.next(true);
  }

  closeAddCategoryWindow(): void {
    this.addCategoryWindow.next(false);
    this.newCategory = '';
  }

  async addCategory(categoryName: string): Promise<void> {
    const trimmed = categoryName?.trim();
    if (!trimmed) return;

    const category: Partial<Category> = {
      name: trimmed,
      userID: this.noteService.getUserId()
    };
    const created = await this.noteService.addCategory(category);

    if (created && (created as any).id !== undefined) {
      this.noteService.notifyCategoriesChanged((created as any).id);
    }
    this.newCategory = '';
    this.closeAddCategoryWindow();
    await this.noteService.loadCategories();
  }

  async deleteCategory(id: number): Promise<void> {
    await this.noteService.deleteCategory(id);
    this.noteService.notifyCategoriesChanged(id);
    if (this.openCategoryId === id) {
      this.openCategoryId = null;
    }
    await this.noteService.loadCategories();
    await this.getNotes();
  }

  /** The note disappears at once; an Undo bar shows for a few seconds before it's really deleted. */
  deleteNote(note: Note): void {
    let open: Note | null = null;
    this.modelService.currentNote$.subscribe(n => open = n).unsubscribe();
    if (open && (open as Note).id === note.id) this.modelService.openHome();
    this.noteService.deleteWithUndo(note);
  }
}
