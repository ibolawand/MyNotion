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

  async deleteNote(id: number): Promise<void> {
    await this.noteService.deleteNote(id);
  }
}
