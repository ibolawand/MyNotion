/**
 * "Save as PDF" for a note. The page sends the note as it is drawn on screen (formulas already drawn by KaTeX,
 * pictures as mynotion-image:// links) plus KaTeX's styles; here it's laid out on white A4 paper in a hidden window
 * with JavaScript turned off, printed to PDF and saved where the user picks.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

/** A file name from the note's title: no slashes or other characters file systems refuse. */
export function pdfName(title: string): string {
    const clean = (title || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    return (clean || 'Note') + '.pdf';
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The page that gets printed. `base` lets KaTeX's fonts load from the app's own files. */
export function printPage(title: string, body: string, css: string, base: string): string {
    const date = new Date().toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' });
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src mynotion-image: data:; style-src 'unsafe-inline'; font-src file: data: http://localhost:4200;">
<base href="${esc(base)}"><title>${esc(title)}</title>
<style>${css.replace(/<\/style/gi, '')}</style><style>${PAPER}</style></head>
<body><header><h1 class="note-title">${esc(title || 'Untitled')}</h1><div class="date">${esc(date)}</div></header>
<main>${body}</main></body></html>`;
}

const PAPER = `
@page { size: A4; margin: 18mm 17mm 20mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; }
body { font: 11pt/1.6 Charter, 'Bitstream Charter', 'Noto Serif', 'DejaVu Serif', Georgia, serif; color: #1c1f26; }
header { margin-bottom: 18pt; padding-bottom: 8pt; border-bottom: 1.5pt solid #16a34a; }
.note-title { font: 700 21pt/1.2 -apple-system, 'Segoe UI', Roboto, Ubuntu, 'Noto Sans', sans-serif; margin: 0 0 3pt; border: 0; }
.date { font: 9pt sans-serif; color: #6b7280; }
h1, h2, h3 { font-family: -apple-system, 'Segoe UI', Roboto, Ubuntu, 'Noto Sans', sans-serif; line-height: 1.25; color: #111;
  break-after: avoid; page-break-after: avoid; }
h1 { font-size: 17pt; margin: 18pt 0 6pt; } h2 { font-size: 14pt; margin: 15pt 0 5pt; } h3 { font-size: 12pt; margin: 12pt 0 4pt; }
p { margin: 0 0 7pt; orphans: 3; widows: 3; }
a { color: #15803d; }
ul, ol { padding-left: 20pt; margin: 0 0 7pt; } li > p { margin: 0 0 2pt; }
ul[data-type="taskList"] { list-style: none; padding-left: 2pt; }
ul[data-type="taskList"] li { display: flex; gap: 6pt; align-items: baseline; }
ul[data-type="taskList"] li > label { flex: none; } ul[data-type="taskList"] li > div { flex: 1; }
ul[data-type="taskList"] li[data-checked="true"] > div { color: #6b7280; text-decoration: line-through; }
blockquote { margin: 8pt 0; padding-left: 10pt; border-left: 2.5pt solid #16a34a; color: #374151; font-style: italic; }
code { font: 9.5pt 'DejaVu Sans Mono', monospace; background: #f3f4f6; padding: 1pt 3pt; border-radius: 3pt; }
pre { background: #f3f4f6; padding: 8pt 10pt; border-radius: 4pt; white-space: pre-wrap; break-inside: avoid; }
pre code { padding: 0; background: none; }
hr { border: 0; border-top: 1pt solid #d1d5db; margin: 12pt 0; }
mark { padding: 0 1pt; border-radius: 2pt; }
sub, sup { font-size: 0.72em; line-height: 0; }
img { max-width: 100%; height: auto; }
.note-image, [data-resize-container] { display: flex; margin: 8pt 0; break-inside: avoid; }
[data-resize-wrapper] { max-width: 100%; }
.tableWrapper { margin: 8pt 0 10pt; }
table { border-collapse: collapse; break-inside: auto; font-size: 10pt; max-width: 100%; }
tr { break-inside: avoid; }
th, td { border: 0.75pt solid #9ca3af; padding: 3pt 6pt; vertical-align: top; text-align: left; }
th { background: #f0fdf4; font-family: sans-serif; font-weight: 650; }
th p, td p { margin: 0; }
div[data-type="callout"] { display: flex; gap: 7pt; margin: 8pt 0; padding: 7pt 10pt; border-radius: 5pt; break-inside: avoid;
  border-left: 3pt solid #60a5fa; background: #eff6ff; }
div[data-type="callout"][data-kind="tip"] { border-color: #22c55e; background: #f0fdf4; }
div[data-type="callout"][data-kind="important"] { border-color: #a855f7; background: #faf5ff; }
div[data-type="callout"][data-kind="warning"] { border-color: #f59e0b; background: #fffbeb; }
.callout-icon { border: 0; background: none; padding: 0; width: 14pt; height: 14pt; color: #4b5563; }
.callout-icon svg { width: 14pt; height: 14pt; fill: none; stroke: currentColor; stroke-width: 2; }
.callout-body { flex: 1; } .callout-body > :last-child { margin-bottom: 0; }
div[data-type="details"] { margin: 6pt 0; break-inside: avoid; }
div[data-type="details"] > button { display: none; }
summary { font-weight: 700; list-style: none; } summary::-webkit-details-marker { display: none; }
div[data-type="detailsContent"] { display: block !important; padding-left: 10pt; border-left: 1pt solid #d1d5db; margin-top: 3pt; }
div[data-type="block-math"], .tiptap-mathematics-render[data-type="block-math"] { margin: 8pt 0; break-inside: avoid; }
div[data-align="center"] { justify-content: center; text-align: center; } div[data-align="right"] { justify-content: flex-end; text-align: right; }
.find-hit { background: none !important; }
`;

export function setUpPdf() {
    ipcMain.handle('note:pdf', async (event, args: { title?: unknown; body?: unknown; css?: unknown; base?: unknown }) => {
        const title = typeof args?.title === 'string' ? args.title : '';
        const body = typeof args?.body === 'string' ? args.body : '';
        const css = typeof args?.css === 'string' ? args.css : '';
        const base = typeof args?.base === 'string' && /^(file|http):/i.test(args.base) ? args.base : '';
        const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        // (MYNOTION_PDF_DIR: save there without asking; only for testing the app from a script)
        const picked = process.env.MYNOTION_PDF_DIR
            ? { canceled: false, filePath: path.join(process.env.MYNOTION_PDF_DIR, pdfName(title)) }
            : await dialog.showSaveDialog(owner!, {
            title: 'Save note as PDF',
            defaultPath: path.join(app.getPath('documents'), pdfName(title)),
            filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (picked.canceled || !picked.filePath) return { ok: false, canceled: true };
        const target = picked.filePath.toLowerCase().endsWith('.pdf') ? picked.filePath : picked.filePath + '.pdf';

        const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mynotion-pdf-')), 'note.html');
        const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
        try {
            fs.writeFileSync(tmp, printPage(title, body, css, base));
            await win.loadFile(tmp);                      // (waits for the pictures too: they're in the page from the start)
            await new Promise(r => setTimeout(r, 250));   // and a moment for the fonts
            const pdf = await win.webContents.printToPDF({
                pageSize: 'A4', printBackground: true, preferCSSPageSize: true,
                displayHeaderFooter: true, headerTemplate: '<span></span>',
                footerTemplate: '<div style="width:100%;font:8px sans-serif;color:#9ca3af;text-align:center">'
                    + '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
            });
            fs.writeFileSync(target, pdf);
            return { ok: true, path: target };
        } catch (err) {
            console.error('Could not save the PDF:', err);
            return { ok: false, error: 'The PDF could not be saved.' };
        } finally {
            win.destroy();
            fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
        }
    });

    ipcMain.handle('note:pdf-show', (_event, file: unknown) => {
        if (typeof file === 'string' && file.toLowerCase().endsWith('.pdf') && fs.existsSync(file)) shell.showItemInFolder(file);
    });
}
