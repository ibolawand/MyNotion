import { Component, OnInit, OnDestroy } from '@angular/core';
import { NoteService } from '../../services/NoteService';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AsyncPipe, CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { Category, Folder, Note } from '../../model/models';
import { ModelService } from '../model.service';
import { TextEditor } from '../text-editor/text-editor';

@Component({
  selector: 'app-editor',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    AsyncPipe,
    CommonModule,
    TextEditor
  ],
  templateUrl: './editor.html',
  styleUrl: './editor.css'
})
export class Editor implements OnInit, OnDestroy {
  title: string = '';
  content: string = '';
  folderID: number = 0;
  categoryID: number = 0;
  currentNote: Note | null = null;
  folders: Folder[] = [];
  categories: Category[] = [];

  private subscriptions: Subscription[] = [];

  constructor(protected modelService: ModelService, protected noteService: NoteService) {}

  async ngOnInit(): Promise<void> {
    this.folders = await this.noteService.loadFolders();
    await this.noteService.loadCategories();

    this.subscriptions.push(
      this.modelService.currentNote$.subscribe((note: Note | null) => {
        if (note) {
          this.currentNote = note;
          this.title = note.title ?? '';
          this.content = note.content ?? '';
          this.folderID = note.folderID ?? 0;
          this.categoryID = note.categoryID ?? 0;
        } else {
          this.currentNote = null;
          this.title = '';
          this.content = '';
          this.folderID = 0;
          this.categoryID = 0;
        }
      }),
      this.noteService.folderChanged$.subscribe(async () => {
        this.folders = await this.noteService.loadFolders();
      }),
      this.noteService.categories$.subscribe(cats => {
        this.categories = cats || [];
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  onTitleChange(value: string) {
    this.title = value;
    if (this.currentNote) {
      this.currentNote.title = value;
      this.modelService.updateCurrentNote(this.currentNote);
      this.noteService.triggerAutoSave(this.currentNote);
    }
  }

  async onFolderChange(value: any) {
    const id = Number(value) || 0;
    this.folderID = id;
    if (this.currentNote) {
      this.currentNote.folderID = id;
      this.modelService.updateCurrentNote(this.currentNote);
      if (this.currentNote.id) {
        await this.noteService.updateNote(this.currentNote);
      } else {
        this.noteService.triggerAutoSave(this.currentNote);
      }
    }
  }

  async onCategoryChange(value: any) {
    const id = Number(value) || 0;
    this.categoryID = id;
    if (this.currentNote) {
      this.currentNote.categoryID = id;
      this.modelService.updateCurrentNote(this.currentNote);
      if (this.currentNote.id) {
        await this.noteService.updateNote(this.currentNote);
      } else {
        this.noteService.triggerAutoSave(this.currentNote);
      }
    }
  }

  onContentChange(value: string) {
    this.content = value;
    if (this.currentNote) {
      this.currentNote.content = value;
      this.modelService.updateCurrentNote(this.currentNote);
      this.noteService.triggerAutoSave(this.currentNote);
    }
  }

  isTextSelected(): boolean {
    const selection = window.getSelection();
    return selection !== null && selection.toString().length > 0;
  }
}
