import {Component} from '@angular/core';
import {NoteService} from '../../services/NoteService';
import {ModelService} from '../model.service';
import {AsyncPipe} from '@angular/common';
import {Folder} from '../../model/models';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'app-folder-adder',
  standalone: true,
  imports: [
    AsyncPipe,
    FormsModule
  ],
  templateUrl: './note-adder.html',
  styleUrls: ['./note-adder.css']
})
export class FolderAdder {
  name: string = "";
  colour: string = "#4ade80";
  colours = ['#4ade80', '#3b82f6', '#a855f7', '#ef4444', '#f59e0b', '#ec4899', '#06b6d4', '#9ca3af'];
  colourF = '#4ade80';

  constructor(
    private noteService: NoteService,
    public modelService: ModelService,
  ) {}

  selectColour(color: string): void {
    this.colour = color;
  }

  async addNoteFolder(): Promise<void> {
    let id =await this.noteService.getFolders();
    const folder: Folder = {
      id:id.length,
      name: this.name?.trim() ?? "",
      colour: this.colour,
    };

    if (!folder.name) {
      return;
    }

    await this.noteService.addFolder(folder);
    this.noteService.notifyFolderChanged();
    this.modelService.closeFolderAdder();
  }

  closeFolder(): void {
    this.modelService.closeFolderAdder();
  }

}
