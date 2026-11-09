import { Component, ElementRef, HostListener } from '@angular/core';
import { RadioService, STATIONS, Station } from '../../services/RadioService';

/** The radio in the editor's bottom bar: ▶/⏸ plays the station, the name opens the list of stations and the volume. */
@Component({
  selector: 'app-radio-button',
  standalone: true,
  templateUrl: './radio-button.html',
  styleUrl: './radio-button.css',
})
export class RadioButton {
  readonly stations = STATIONS;
  open = false;

  constructor(protected radio: RadioService, private host: ElementRef<HTMLElement>) {}

  pick(s: Station) {
    this.radio.choose(s);
    if (!this.radio.playing) this.radio.play();
  }

  onVolume(e: Event) {
    this.radio.setVolume(Number((e.target as HTMLInputElement).value) / 100);
  }

  @HostListener('document:mousedown', ['$event'])
  closeOutside(e: MouseEvent) {
    if (this.open && !this.host.nativeElement.contains(e.target as Node)) this.open = false;
  }

  @HostListener('keydown.escape')
  close() {
    this.open = false;
  }
}
