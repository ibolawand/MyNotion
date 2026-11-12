import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { Folder } from '../../model/models';
import { MailService } from '../../services/MailService';
import { NoteService } from '../../services/NoteService';
import { ModelService, Workspace, descendantIds } from '../model.service';
import { FolderAdder } from '../folder-adder/note-adder';

/** The slim bar above the shelf and the opened book: where the sidebar's menu went. */
@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [AsyncPipe, FolderAdder],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
})
export class TopBar implements OnInit, OnDestroy {
  view: Workspace['view'] = 'shelf';
  books: Folder[] = [];
  choosing = false;                 // "New note": where should it go?
  private subs: Subscription[] = [];

  constructor(public modelService: ModelService, public mail: MailService, private noteService: NoteService) {}

  ngOnInit() {
    this.subs.push(
      this.modelService.workspace$.subscribe(w => { this.view = w.view; this.choosing = false; }),
      this.modelService.folders$.subscribe(list => this.books = list.filter(f => f.parentID == null)),
    );
  }

  ngOnDestroy() { this.subs.forEach(s => s.unsubscribe()); }

  get inNote(): boolean { return this.view === 'book' || this.view === 'slip'; }

  /** Back to the shelf; what is being typed is written first. */
  async back() {
    await this.noteService.flushSaves();
    this.modelService.openHome();
  }

  newNote() {
    if (this.view === 'book') this.modelService.toggleOpenNewNote();      // into the open book
    else this.choosing = !this.choosing;
  }

  newNoteIn(book: Folder | null) {
    this.choosing = false;
    this.modelService.newNoteIn(book, book ? descendantIds(book.id, this.modelService.folders.value) : []);
  }

  newBook() { this.choosing = false; this.modelService.openFolderAdder(null); }

  /** Esc: close the "where?" list, else leave the book or note. Not while typing: there Esc closes the editor's
   *  own popups (formula box, menus), and not while a dialog is open. */
  @HostListener('document:keydown.escape', ['$event'])
  onEscape(e: Event) {
    if (e.defaultPrevented) return;
    if (this.choosing) { this.choosing = false; return; }
    if (!this.inNote) return;
    const target = e.target as HTMLElement | null;
    const typing = !!target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""], app-editor, app-aria-panel');
    const dialog = !!document.querySelector('.qs-backdrop, .modal-overlay, .modal-backdrop');
    if (typing || dialog) return;
    void this.back();
  }

  @HostListener('document:mousedown', ['$event'])
  onOutside(e: Event) {
    if (this.choosing && !(e.target as HTMLElement | null)?.closest?.('.new-note-wrap')) this.choosing = false;
  }
}
