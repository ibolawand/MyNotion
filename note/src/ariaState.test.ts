import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: {}, app: { getPath: () => '/tmp' } }));
vi.mock('./database/database', () => ({ DB: {} }));
import { LOCK_FOR_S, lockedNote } from './ariaState';

const now = Date.parse('2026-11-09T12:00:00Z');

describe('Aria editing a note', () => {
    it('locks the note Aria is working on', () => {
        expect(lockedNote({ value: '12', updated_at: '2026-11-09 11:59:30' }, now)).toBe(12);
    });

    it('ignores a lock Aria left behind', () => {
        const old = new Date(now - (LOCK_FOR_S + 5) * 1000).toISOString().replace('T', ' ').slice(0, 19);
        expect(lockedNote({ value: '12', updated_at: old }, now)).toBeNull();
    });

    it('nothing locked: no row, no value or something odd in it', () => {
        expect(lockedNote(undefined, now)).toBeNull();
        expect(lockedNote({ value: null, updated_at: '2026-11-09 11:59:30' }, now)).toBeNull();
        expect(lockedNote({ value: '12; DROP', updated_at: '2026-11-09 11:59:30' }, now)).toBeNull();
    });
});
