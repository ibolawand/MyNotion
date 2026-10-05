import {Component, OnInit} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {ModelService} from '../model.service';
import {AsyncPipe} from '@angular/common';
import {NoteService} from '../../services/NoteService';
import {FormsModule} from '@angular/forms';
import {Category, Note} from '../../model/models';
import {BehaviorSubject, from, Observable} from 'rxjs';

@Component({
  selector: 'app-adder',
  imports: [
    AsyncPipe,
    FormsModule
  ],
  templateUrl: './adder.html',
  styleUrl: './adder.css'
})
export class Adder implements OnInit {
  title = '';
  content = '';
  categoryID: number = 0;
  categories$ = new Observable<Category[]>();
  categories: Category[] = [];
  currentNote: Note= {title: '', content: '', categoryID: 0};



  constructor(private http: HttpClient,
              public modelService: ModelService,
              protected noteService: NoteService
  ) {
  }


  async ngOnInit() {
    this.noteService.categories$.subscribe(list => this.categories = list);
  }


  onTitleChange(value: string) {
    this.title = value;
    this.currentNote.title = value;
    this.noteService.triggerAutoSave(this.currentNote);
  }

  onContentChange(value: string) {
    this.content = value;
    this.currentNote.content = value;
    this.noteService.triggerAutoSave(this.currentNote);
  }

  onCategoryChange(value: any) {
    this.currentNote.categoryID = Number(value) || 0;
    this.noteService.triggerAutoSave(this.currentNote);
  }
}
