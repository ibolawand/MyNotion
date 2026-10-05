import { Component, OnInit, OnDestroy } from '@angular/core';
import { NoteService } from '../../services/NoteService';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AsyncPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { Note } from '../../model/models';
import { ModelService } from '../model.service';
import { TextEditor } from '../text-editor/text-editor';

@Component({
  selector: 'app-editor',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    AsyncPipe,
    TextEditor
  ],
  templateUrl: './editor.html',
  styleUrl: './editor.css'
})
export class Editor implements OnInit {
  title: string = '';
  content: string = '';
  currentNote: Note | null = null;
  private noteSub?: Subscription;

  constructor(protected modelService: ModelService, protected noteService: NoteService) {
  }

  ngOnInit(): void {
    this.noteSub = this.modelService.currentNote$.subscribe((note: Note | null) => {
      if (note) {
        this.currentNote = note;
        this.title = note.title ?? '';
        this.content = note.content ?? '';
      } else {
        this.currentNote = null;
        this.title = '';
        this.content = '';
      }
    });
  }

  ngOnDestroy(): void {
    this.noteSub?.unsubscribe();
  }

  onTitleChange(value: string) {
    this.title = value;
    if (this.currentNote) {
      this.currentNote.title = value;
      // notify other components and trigger autosave
      this.modelService.updateCurrentNote(this.currentNote);
      this.noteService.triggerAutoSave(this.currentNote);
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
