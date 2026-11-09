import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { startScene } from './scene';

export type SceneMode = 'off' | 'corner' | 'background';

/** The study scene (scene.ts): a small window in the corner, or the background behind the note. */
@Component({
  selector: 'app-study-scene',
  standalone: true,
  templateUrl: './study-scene.html',
  styleUrl: './study-scene.css',
})
export class StudyScene implements AfterViewInit, OnDestroy {
  @Input() mode: SceneMode = 'corner';
  @Output() modeChange = new EventEmitter<SceneMode>();
  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  private stop?: () => void;

  ngAfterViewInit() {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.stop = startScene(this.canvas.nativeElement, { still, fps: 24 });
  }

  ngOnDestroy() {
    this.stop?.();
  }
}
