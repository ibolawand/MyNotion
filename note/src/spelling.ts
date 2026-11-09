/**
 * Spell-checking in German and English (Electron only checks English by default, so every German word was
 * underlined), and a right-click menu: the spelling suggestions for the word under the mouse, "Add to dictionary",
 * and cut / copy / paste. The dictionaries are downloaded once by Electron (Chromium's Hunspell files); the text
 * itself never leaves the computer.
 */
import { BrowserWindow, ContextMenuParams, Menu, MenuItemConstructorOptions, clipboard, session } from 'electron';

export const SPELL_LANGUAGES = ['de-DE', 'en-US'];

type Actions = {
    replace: (word: string) => void;
    learn: (word: string) => void;
    copyLink: (url: string) => void;
};

/** What the right-click menu shows for this spot (separate from Electron, so it can be tested). */
export function menuFor(p: Pick<ContextMenuParams, 'misspelledWord' | 'dictionarySuggestions' | 'isEditable' |
    'selectionText' | 'editFlags' | 'linkURL'>, act: Actions): MenuItemConstructorOptions[] {
    const items: MenuItemConstructorOptions[] = [];
    if (p.misspelledWord) {
        const tips = p.dictionarySuggestions.slice(0, 5);
        for (const word of tips) items.push({ label: word, click: () => act.replace(word) });
        if (!tips.length) items.push({ label: 'No suggestions', enabled: false });
        items.push({ label: `Add “${p.misspelledWord}” to the dictionary`, click: () => act.learn(p.misspelledWord) });
        items.push({ type: 'separator' });
    }
    if (p.linkURL && /^(https?|mailto):/i.test(p.linkURL)) {
        items.push({ label: 'Copy link', click: () => act.copyLink(p.linkURL) }, { type: 'separator' });
    }
    if (p.isEditable) {
        items.push(
            { role: 'cut', label: 'Cut', enabled: p.editFlags.canCut },
            { role: 'copy', label: 'Copy', enabled: p.editFlags.canCopy },
            { role: 'paste', label: 'Paste', enabled: p.editFlags.canPaste },
            { role: 'selectAll', label: 'Select all' },
        );
    } else if (p.selectionText.trim()) {
        items.push({ role: 'copy', label: 'Copy' });
    }
    while (items.length && items[items.length - 1].type === 'separator') items.pop();
    return items;
}

export function setUpSpelling(win: BrowserWindow) {
    const ses = session.defaultSession;
    try {
        const known = ses.availableSpellCheckerLanguages;
        const langs = SPELL_LANGUAGES.filter(l => !known.length || known.includes(l));
        ses.setSpellCheckerLanguages(langs.length ? langs : ['en-US']);
    } catch (err) {
        console.error('Could not set the spell-check languages:', err);
    }

    win.webContents.on('context-menu', (_event, params) => {
        const items = menuFor(params, {
            replace: word => win.webContents.replaceMisspelling(word),
            learn: word => ses.addWordToSpellCheckerDictionary(word),
            copyLink: url => clipboard.writeText(url),
        });
        if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
    });
}
