import { Component, OnDestroy, OnInit } from '@angular/core';
import { FolderAdder } from "../folder-adder/note-adder";
import { Folder } from '../../model/models';
import {FolderRow} from '../../model/models';
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
  expanded = new Set<number>();
  newFolderParent: number | null = null;
  newFolder: string = '';



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
    this.folders = await this.noteService.loadFolders();
  }
   async addFolder(folderName: string): Promise<void> {
      const name = folderName?.trim();
      if (!name) return;                              // leere Namen nicht speichern

      const parentID = this.newFolderParent;        // null = oberste Ebene

      const folder: Partial<Folder> = {
        name,
        userID: this.noteService.getUserId(),
        parentID
      };

      await this.noteService.addFolder(folder);
      this.noteService.notifyFolderChanged();
      

      if (parentID !== null) {
        this.expanded.add(parentID);
      }

      this.newFolder = '';
      this.closeFolderAdder();
      await this.noteService.loadFolders();
  }

  openFolderAdder(): void {
    this.modelService.openFolderAdder();
  } 
  closeFolderAdder(): void {
    this.modelService.closeFolderAdder();
  }
  get folderRows(): FolderRow[] {
    const byParent = new Map<number | null, Folder[]>();
    for (const f of this.folders) {
      const p = f.parentID ?? null;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p)!.push(f);
    }

    const result: FolderRow[] = [];
    const walk = (parentId: number | null, depth: number) => {
      for (const folder of byParent.get(parentId) ?? []) {
        const hasChildren = byParent.has(folder.id);
        result.push({ folder, depth, hasChildren });
        if (hasChildren && this.expanded.has(folder.id)) walk(folder.id, depth + 1);
      }
    };
    walk(null, 0);
    return result;
  }
  private decendantFolderIds(folderId: number): number[] {
    const ids: number[] = [];
    const addDescendants = (parentId: number) => {
      for (const folder of this.folders) {
        if ((folder as any).parent_id === parentId) {
          ids.push(folder.id);
          addDescendants(folder.id);
        }
      }
    }
    addDescendants(folderId);
    return ids;
  }
 
  openAddFolderWindow(parentID: number | null = null) {
    this.newFolderParent = parentID;
    this.modelService.openFolderAdder(parentID);
  }

  toggleExpand(id: number, event: Event): void {
    event.stopPropagation();
    this.expanded.has(id) ? this.expanded.delete(id) : this.expanded.add(id);
  }
  selectFolder(folder: Folder) {
    this.modelService.setCurrentFolder(folder);
    this.modelService.currentFolderIds.next([folder.id, ...this.decendantFolderIds(folder.id)]);
  }
  selectAll() {
    this.modelService.setCurrentFolder(null);
    this.modelService.currentFolderIds.next([]);
  }
  async deleteFolder(folder: Folder): Promise<void> {
    await this.noteService.deleteFolder(folder);
    this.folders = this.folders.filter(f => f.id !== folder.id);
    this.noteService.notifyFolderChanged();
  }
  
  
}
