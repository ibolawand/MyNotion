import { frequency, isBlack, keyForLetter, noteName, PIANO_KEYS } from './piano';

describe('desk piano', () => {
  it('starts at middle C and goes up in semitones', () => {
    expect(frequency(0)).toBeCloseTo(261.63, 1);
    expect(frequency(9)).toBeCloseTo(440, 5);
    expect(frequency(12)).toBeCloseTo(523.25, 1);
    expect(noteName(0)).toBe('C 4');
    expect(noteName(13)).toBe('C sharp 5');
  });

  it('has ten black keys in two octaves', () => {
    expect(Array.from({ length: PIANO_KEYS }, (_, k) => k).filter(isBlack)).toEqual([1, 3, 6, 8, 10, 13, 15, 18, 20, 22]);
  });

  it('maps the letter keys like a piano', () => {
    expect(keyForLetter('a')).toBe(0);
    expect(keyForLetter('W')).toBe(1);
    expect(keyForLetter('k')).toBe(12);
    expect(keyForLetter('q')).toBe(-1);
    expect(keyForLetter('Enter')).toBe(-1);
  });
});
