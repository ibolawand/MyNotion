#!/usr/bin/env node
// Theme check for MyNotion's dark/green palette.
//   node scripts/check-theme.mjs [--strict] [files…]      (run from note-frontend/)
// Always: every text token must reach WCAG AA (4.5:1) on every surface token in src/styles.css :root.
// With files: lists colours typed directly into CSS instead of a token. --strict fails if any are left.
import { readFileSync } from 'node:fs';

const STYLES = 'src/styles.css';
const TEXTS = ['--text', '--text-2', '--text-3', '--accent', '--danger', '--warn', '--info'];
const SURFACES = ['--bg-sunken', '--bg', '--bg-raised'];

// Literals that are content or artwork, not UI chrome. Each needs a reason.
const ALLOW = {
  'src/app/calendar/calendar.css': ['#ef4444', '#3b82f6', '#22c55e', '#a855f7'], // the four event colours users pick
  'src/app/inbox/mail-reader.css': ['#fff', '#10131f'], // white mail "paper"; initials on a generated avatar hue
  'src/app/inbox/inbox.css': ['#10131f'], // initials on a generated avatar hue
};

const COLOUR = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)/g;

function rootTokens() {
  const css = readFileSync(STYLES, 'utf8');
  const root = css.match(/:root\s*\{([^}]*)\}/);
  const tokens = {};
  if (root) for (const m of root[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  return tokens;
}

function rgba(value) {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
  }
  const fn = value.match(/^rgba?\(([^)]*)\)$/);
  if (fn) {
    const [r, g, b, a = '1'] = fn[1].split(/[\s,/]+/).filter(Boolean);
    return [+r, +g, +b, +a];
  }
  return null;
}

const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3])).concat(1);

function luminance([r, g, b]) {
  const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function checkContrast(tokens) {
  const failures = [];
  const get = (name) => {
    const v = tokens[name] && rgba(tokens[name]);
    if (!v) failures.push(`missing token ${name}`);
    return v;
  };
  const base = get('--bg');
  const pairs = TEXTS.flatMap((t) => SURFACES.map((s) => [t, s])).concat([['--on-accent', '--accent-fill']]);
  for (const [t, s] of pairs) {
    const fg = get(t), bg = get(s);
    if (!fg || !bg || !base) continue;
    const ratio = contrast(over(fg, over(bg, base)), over(bg, base));
    const ok = ratio >= 4.5;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${t} on ${s}: ${ratio.toFixed(2)}`);
    if (!ok) failures.push(`${t} on ${s} is ${ratio.toFixed(2)}:1`);
  }
  return failures;
}

function literals(file) {
  let css = readFileSync(file, 'utf8');
  if (file === STYLES) css = css.replace(/:root\s*\{[^}]*\}/, (m) => m.replace(/[^\n]/g, ' '));
  css = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const allowed = new Set((ALLOW[file] ?? []).map((v) => v.toLowerCase()));
  const found = [];
  css.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(COLOUR)) {
      const v = m[0].toLowerCase().replace(/\s+/g, ' ');
      if (allowed.has(v) || /^rgba?\(\s*0[ ,]+0[ ,]+0\b/.test(v)) continue; // black = shadows
      found.push(`${file}:${i + 1}: ${m[0]}`);
    }
  });
  return found;
}

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const files = args.filter((a) => a !== '--strict');

const failures = checkContrast(rootTokens());
const left = files.flatMap(literals);
for (const l of left) console.log(`literal ${l}`);
console.log(`${left.length} hard-coded colour(s) in ${files.length} file(s)`);
for (const f of failures) console.error(f);
if (failures.length || (strict && left.length)) process.exit(1);
