/** The little piano on the desk: two octaves from middle C, played with the mouse or the letter keys.
 *  The sound is made here (Web Audio): no samples, nothing to download. */

export const PIANO_KEYS = 24;
const BLACK = [1, 3, 6, 8, 10];
/** Letter keys, one octave and a bit, laid out like a piano: A = C, W = C sharp, S = D … */
const LETTERS = 'awsedftgyhujkolp;';

export function isBlack(key: number): boolean { return BLACK.includes(key % 12); }
/** Key 0 is middle C (261.63 Hz); every key is a semitone. */
export function frequency(key: number): number { return 440 * Math.pow(2, (key - 9) / 12); }
export function noteName(key: number): string {
  return ['C', 'C sharp', 'D', 'D sharp', 'E', 'F', 'F sharp', 'G', 'G sharp', 'A', 'A sharp', 'B'][key % 12] + ' ' + (4 + Math.floor(key / 12));
}
/** Which piano key a letter plays, or -1. */
export function keyForLetter(letter: string): number { return letter.length === 1 ? LETTERS.indexOf(letter.toLowerCase()) : -1; }

export class PianoSound {
  private ctx?: AudioContext;
  private out?: GainNode;

  play(key: number) {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) {
      this.ctx = new Ctx();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.5;
      this.out.connect(this.ctx.destination);
    }
    const ctx = this.ctx!, now = ctx.currentTime, f = frequency(key);
    if (ctx.state === 'suspended') void ctx.resume();
    const voice = ctx.createGain(), tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(Math.min(9000, f * 7), now);
    tone.frequency.exponentialRampToValueAtTime(Math.max(500, f * 2), now + 0.9);     // bright when struck, then mellow
    voice.gain.setValueAtTime(0.0001, now);
    voice.gain.exponentialRampToValueAtTime(0.55, now + 0.008);
    voice.gain.exponentialRampToValueAtTime(0.16, now + 0.35);
    voice.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    // a struck string: the note, its overtones a little sharp, each quieter
    for (const [mult, level, type] of [[1, 1, 'triangle'], [2.003, 0.34, 'sine'], [3.01, 0.13, 'sine'], [4.02, 0.05, 'sine']] as const) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type; osc.frequency.value = f * mult; g.gain.value = level;
      osc.connect(g).connect(tone);
      osc.start(now); osc.stop(now + 2.3);
    }
    tone.connect(voice).connect(this.out!);
    setTimeout(() => voice.disconnect(), 2500);
  }

  close() { void this.ctx?.close(); this.ctx = undefined; }
}
