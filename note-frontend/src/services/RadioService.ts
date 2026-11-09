import { Injectable, NgZone } from '@angular/core';

/** Lofi radio to study with: internet radio streams, no ads, nothing to download. One player for the whole app,
 *  so the music keeps going when you switch notes or open the calendar. It never starts by itself; the station
 *  and volume you picked are remembered. */

export type Station = { id: string; name: string; kind: string; url: string };

export const STATIONS: Station[] = [
  { id: 'lofi', name: 'REYFM #lofi', kind: 'Lofi beats', url: 'https://listen.reyfm.de/lofi_320kbps.mp3' },
  { id: 'plaza', name: 'Nightwave Plaza', kind: '90s city pop', url: 'https://radio.plaza.one/mp3' },
  { id: 'groove', name: 'Groove Salad', kind: 'Chill (SomaFM)', url: 'https://ice2.somafm.com/groovesalad-128-mp3' },
  { id: 'fluid', name: 'Fluid', kind: 'Lo-fi hip-hop (SomaFM)', url: 'https://ice1.somafm.com/fluid-128-mp3' },
];

export type RadioState = 'off' | 'loading' | 'playing' | 'error';

const STATION_KEY = 'mynotion.radio.station';
const VOLUME_KEY = 'mynotion.radio.volume';

@Injectable({ providedIn: 'root' })
export class RadioService {
  station: Station = STATIONS[0];
  volume = 0.6;
  state: RadioState = 'off';
  private audio?: HTMLAudioElement;

  constructor(private zone: NgZone) {
    try {
      this.station = STATIONS.find(s => s.id === localStorage.getItem(STATION_KEY)) ?? STATIONS[0];
      const v = Number(localStorage.getItem(VOLUME_KEY));
      if (localStorage.getItem(VOLUME_KEY) !== null && v >= 0 && v <= 1) this.volume = v;
    } catch { /* defaults */ }
  }

  get playing(): boolean {
    return this.state === 'playing' || this.state === 'loading';
  }

  toggle() {
    if (this.playing) this.stop(); else this.play();
  }

  play() {
    const a = this.player();
    this.state = 'loading';
    a.src = this.station.url;            // a live stream: always start from "now"
    a.volume = this.volume;
    a.play().catch(() => this.zone.run(() => { if (this.state === 'loading') this.state = 'error'; }));
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');  // stop downloading the stream too
      this.audio.load();
    }
    this.state = 'off';
  }

  choose(station: Station) {
    this.station = station;
    try { localStorage.setItem(STATION_KEY, station.id); } catch { /* not saved, fine */ }
    if (this.playing || this.state === 'error') this.play();
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.audio) this.audio.volume = this.volume;
    try { localStorage.setItem(VOLUME_KEY, String(this.volume)); } catch { /* not saved, fine */ }
  }

  private player(): HTMLAudioElement {
    if (!this.audio) {
      const a = new Audio();
      a.preload = 'none';
      a.addEventListener('playing', () => this.zone.run(() => this.state = 'playing'));
      a.addEventListener('waiting', () => this.zone.run(() => { if (this.state === 'playing') this.state = 'loading'; }));
      a.addEventListener('error', () => this.zone.run(() => { if (this.state !== 'off') this.state = 'error'; }));
      this.audio = a;
    }
    return this.audio;
  }
}
