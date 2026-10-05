import { Component } from '@angular/core';
import { NoteService } from '../../services/NoteService';
@Component({
  selector: 'app-window-bar',
  imports: [],
  templateUrl: './window-bar.html',
  styleUrl: './window-bar.css'
})
export class WindowBar {
  constructor(private noteService: NoteService) { }

  minimizeWindow() {
    this.noteService.minimizeWindow();
  }

  maximizeWindow() {
    this.noteService.maximizeWindow();
  }

  closeWindow() {
    this.noteService.closeWindow();
  }

}
