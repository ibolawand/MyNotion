import { Component } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { NoteService } from '../../services/NoteService';

/** "Deleted 'X'  Undo" at the bottom for a few seconds after deleting a note. */
@Component({
  selector: 'app-undo-bar',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    @if (noteService.undoable$ | async; as note) {
      <div class="undo-bar" role="status">
        <span class="msg">Deleted <strong>{{ note.title || 'Untitled note' }}</strong></span>
        <button type="button" (click)="noteService.undoDelete()">Undo</button>
        <span class="timer" [style.animation-duration.ms]="ms"></span>
      </div>
    }
  `,
  styles: [`
    .undo-bar {
      position: fixed;
      left: 50%;
      bottom: 24px;
      transform: translateX(-50%);
      z-index: 900;
      display: flex;
      align-items: center;
      gap: 16px;
      max-width: calc(100vw - 32px);
      padding: 10px 10px 10px 16px;
      border-radius: 10px;
      background: #2e3349;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 14px 36px rgba(5, 7, 18, 0.55);
      color: #e4e7eb;
      font: 13.5px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, Cantarell, sans-serif;
      animation: undo-in 0.15s ease-out;
    }
    .msg { white-space: nowrap; text-overflow: ellipsis; min-width: 0; }
    strong { font-weight: 600; color: #f5f6f8; }
    button {
      flex: none;
      padding: 6px 12px;
      border-radius: 7px;
      border: 1px solid rgba(74, 222, 128, 0.4);
      background: rgba(74, 222, 128, 0.12);
      color: #4ade80;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: rgba(74, 222, 128, 0.2); }
    button:focus-visible { outline: 2px solid #4ade80; outline-offset: 2px; }
    .timer {
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: 3px;
      height: 2px;
      border-radius: 2px;
      background: rgba(74, 222, 128, 0.5);
      transform-origin: left;
      animation-name: undo-time;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
    }
    @keyframes undo-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
    @keyframes undo-time { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    @media (prefers-reduced-motion: reduce) { .undo-bar { animation: none; } .timer { display: none; } }
  `]
})
export class UndoBar {
  readonly ms = NoteService.UNDO_MS;
  constructor(public noteService: NoteService) {}
}
