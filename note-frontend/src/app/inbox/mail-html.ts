/**
 * HTML mail is shown in a sandboxed iframe (no allow-scripts). On top of that: no script tags, a Content-Security-
 * Policy, and remote images off until "Show images" (they tell the sender you opened it). Links get target=_blank,
 * which the main process sends to the normal browser.
 */
const REMOTE = /^\s*(?:https?:)?\/\//i;

export function blockRemoteImages(html: string): string {
  return html
    .replace(/\s(src|background)\s*=\s*("([^"]*)"|'([^']*)')/gi, (all, attr, _q, d, s) =>
      REMOTE.test(d ?? s ?? '') ? ` data-blocked-${attr.toLowerCase()}=""` : all)
    .replace(/\ssrcset\s*=\s*("[^"]*"|'[^']*')/gi, (all, v) => (/(?:https?:)?\/\//i.test(v) ? '' : all))
    .replace(/url\(\s*(['"]?)(?:https?:)?\/\/[^)]*\)/gi, 'none');
}

export function mailDocument(html: string, showImages: boolean): string {
  const clean = html.replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/<script[^>]*>/gi, '');
  const body = showImages ? clean : blockRemoteImages(clean);
  const img = showImages ? 'data: cid: https: http:' : 'data: cid:';
  return `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${img}; style-src 'unsafe-inline'; font-src data:">` +
    `<base target="_blank"><style>body{margin:16px;font-family:sans-serif;color:#1f2233;background:#fff;word-wrap:break-word}` +
    `img{max-width:100%;height:auto}</style></head><body>${body}</body></html>`;
}

/** For quoting an HTML-only mail in a plain-text reply: paragraphs and line breaks kept. */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A plain-text mail as HTML for the dark reading view: escaped, line breaks kept, links clickable. */
export function textToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/(https?:\/\/[^\s<>"]+?)(?=[.,;:!?)]*(?:\s|&lt;|&gt;|$))/g,
             '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\r?\n/g, '<br>');
}

export function initials(name: string): string {
  const words = (name || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

/** The same hue for the same sender, so people are recognisable in the list and the header. */
export function avatarHue(name: string): number {
  let h = 0;
  for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
