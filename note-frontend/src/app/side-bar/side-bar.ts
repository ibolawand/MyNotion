import { Component, OnDestroy, OnInit } from '@angular/core';
import { FolderAdder } from "../folder-adder/note-adder";
import { Folder } from '../../model/models';
import { ModelService } from '../model.service';
import { NoteService } from '../../services/NoteService';
import { Subscription } from 'rxjs';

import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-side-bar',
  imports: [
    FolderAdder,
    CommonModule
  ],
  templateUrl: './side-bar.html',
  styleUrl: './side-bar.css'
})
export class SideBar implements OnInit, OnDestroy {
  folders: Folder[] = [];
  private folderSub?: Subscription;

  constructor(public modelService: ModelService, private noteService: NoteService) {
  }

  async ngOnInit(): Promise<void> {
    await this.loadFolders();
    this.folderSub = this.noteService.folderChanged$.subscribe(() => this.loadFolders());
  }

  ngOnDestroy() {
    this.folderSub?.unsubscribe();
  }

  async loadFolders(): Promise<void> {
    this.folders = await this.noteService.getFolders();
  }

  openFolderAdder(): void {
    this.modelService.openFolderAdder();
  }

  async deleteFolder(folder: Folder): Promise<void> {
    await this.noteService.deleteFolder(folder);
    this.folders = this.folders.filter(f => f.id !== folder.id);
    this.noteService.notifyFolderChanged();
  }
}
