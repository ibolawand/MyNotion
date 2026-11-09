import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, BrowserWindow: {}, dialog: {}, ipcMain: {}, shell: {} }));
import { pdfName, printPage } from './pdf';

describe('save a note as PDF', () => {
    it('makes a file name any file system takes', () => {
        expect(pdfName('Matrizen (geordnet)')).toBe('Matrizen (geordnet).pdf');
        expect(pdfName('a/b: c?')).toBe('a b c.pdf');
        expect(pdfName('   ')).toBe('Note.pdf');
        expect(pdfName('x'.repeat(300)).length).toBe(124);
    });

    it('puts the title on top, escaped, and runs no scripts', () => {
        const page = printPage('<b>Bio</b> & Chemie', '<p>text</p>', '.katex{}', 'file:///app/browser/index.html');
        expect(page).toContain('&lt;b&gt;Bio&lt;/b&gt; &amp; Chemie');
        expect(page).toContain('<main><p>text</p></main>');
        expect(page).toContain("default-src 'none'");
        expect(page).not.toMatch(/script-src/);
        expect(page).toContain('<base href="file:///app/browser/index.html">');
    });

    it('style text cannot close its own style tag', () => {
        expect(printPage('t', '', 'a{}</style><script>x()</script>', '')).not.toContain('</style><script>');
    });
});
