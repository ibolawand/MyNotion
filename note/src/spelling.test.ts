import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ Menu: {}, session: {}, clipboard: {} }));
import { menuFor } from './spelling';

const base = { misspelledWord: '', dictionarySuggestions: [] as string[], isEditable: true, selectionText: '', linkURL: '',
    editFlags: { canCut: false, canCopy: false, canPaste: true } as any };
const act = () => ({ replace: vi.fn(), learn: vi.fn(), copyLink: vi.fn() });

describe('right-click menu', () => {
    it('offers the spelling suggestions first, and learning the word', () => {
        const a = act();
        const items = menuFor({ ...base, misspelledWord: 'Prüfnug', dictionarySuggestions: ['Prüfung', 'Prüfungen'] }, a);
        expect(items.map(i => i.label ?? i.type)).toEqual(
            ['Prüfung', 'Prüfungen', 'Add “Prüfnug” to the dictionary', 'separator', 'Cut', 'Copy', 'Paste', 'Select all']);
        (items[0].click as any)();
        expect(a.replace).toHaveBeenCalledWith('Prüfung');
        (items[2].click as any)();
        expect(a.learn).toHaveBeenCalledWith('Prüfnug');
    });

    it('says when there are no suggestions', () => {
        const items = menuFor({ ...base, misspelledWord: 'xqzt' }, act());
        expect(items[0]).toEqual({ label: 'No suggestions', enabled: false });
    });

    it('outside the note: only Copy, and only when something is selected', () => {
        expect(menuFor({ ...base, isEditable: false }, act())).toEqual([]);
        expect(menuFor({ ...base, isEditable: false, selectionText: 'hi' }, act()).map(i => i.label)).toEqual(['Copy']);
    });

    it('copies web links, never other kinds of link', () => {
        const a = act();
        const items = menuFor({ ...base, isEditable: false, linkURL: 'https://example.com' }, a);
        expect(items.map(i => i.label)).toEqual(['Copy link']);
        (items[0].click as any)();
        expect(a.copyLink).toHaveBeenCalledWith('https://example.com');
        expect(menuFor({ ...base, isEditable: false, linkURL: 'javascript:alert(1)' }, act())).toEqual([]);
    });
});
