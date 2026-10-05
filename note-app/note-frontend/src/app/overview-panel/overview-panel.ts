import { Component, OnInit } from '@angular/core';
import { NoteService } from '../../services/NoteService';
import { Category, Note } from '../../model/models';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
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
export class OverviewPanel implements OnInit {
  notes: Note[] = []
  allNotes: Note[] = []
  currentCategories: Category[] = [];
  categories: Category[] = []
  newCategory: string = '';
  addCategoryWindow: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  openCategoryId: number | null = null;
  openNote = false;
  clickedCategory: number | null = null;

  constructor(protected noteService: NoteService, public modelService: ModelService) {

  }

  async getNotes(): Promise<void> {
    await this.noteService.loadNotes();
  }


  async getNotesFromCertainCategories(categoryID: number): Promise<void> {
    console.log('Clicked category ID:', categoryID);
    if (this.openCategoryId === categoryID) {
      this.openCategoryId = null;
      this.clickedCategory = null;
      this.notes = [];
      console.log('Closed category');
      return;
    }

    this.openCategoryId = categoryID;
    this.clickedCategory = categoryID; // Set it when opening

    try {
      const fetched = await this.noteService.getNoteWithCertainCategory(Number(categoryID));
      console.log('Fetched raw notes for category', categoryID, fetched);
      if (Array.isArray(fetched)) {
        this.notes = fetched as Note[];
        console.log(`Assigned ${this.notes.length} notes to UI for category`, categoryID);
      } else {
        console.warn('getNoteWithCertainCategory returned non-array value:', fetched);
        this.notes = [];
      }
    } catch (err) {
      console.error('Error fetching notes for category', categoryID, err);
      this.notes = [];
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      console.log(this.currentCategories);
      await this.getNotes();
      await this.noteService.loadCategories();
      this.noteService.notes$.subscribe(list => {
        this.allNotes = list;
        // Also update the filtered notes for the current category
        if (this.openCategoryId !== null) {
          this.notes = this.allNotes.filter(n => n.categoryID === this.openCategoryId);
        }
      });

      this.noteService.notesChanged$.subscribe(async () => {
        await this.getNotes();
      });
      this.noteService.categories$.subscribe(list => {
        this.currentCategories = list
      })

    } catch (error) {
      console.error(error);
    }
  }

  openAddCategoryWindow() {
    this.addCategoryWindow.next(true);
  }

  closeAddCategoryWindow() {
    this.addCategoryWindow.next(false);
  }

  async addCategory(categoryName: string): Promise<void> {
    console.log("categoryName", categoryName);
    console.log("userId", this.noteService!.getUserId());
    const category: Partial<Category> = {
      name: categoryName,
      userID: this.noteService!.getUserId()
    }
    const created = await this.noteService.addCategory(category);


    if (created && (created as any).id !== undefined) {
      this.noteService.notifyCategoriesChanged(created.id);
    }
    this.newCategory = '';
    this.closeAddCategoryWindow();
    await this.noteService.loadCategories();
    console.log("Categories", this.currentCategories);
  }
  async deleteCategory(id: number) {
    await this.noteService.deleteCategory(id)
    this.noteService.notifyCategoriesChanged(id);
  }
  async deleteNote(id: number) {
    await this.noteService.deleteNote(id)
  }
}
