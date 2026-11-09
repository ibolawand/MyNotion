/** Matrices in notes: the grid editor works on a Matrix and saves it as an ordinary LaTeX formula
 *  (\begin{pmatrix} 1 & 0 \\ 0 & 1 \end{pmatrix}), so it shows like any formula and Aria can still read it. */

export type MatrixKind = 'pmatrix' | 'bmatrix' | 'vmatrix';
/** `bar`: a vertical line after that many columns (an augmented matrix, or Sarrus' 3 | 2); none when unset. */
export interface Matrix { kind: MatrixKind; cells: string[][]; bar?: number; }

export const MAX_SIZE = 10;
export const KINDS: { kind: MatrixKind; label: string; title: string }[] = [
  { kind: 'pmatrix', label: '( )', title: 'Round brackets' },
  { kind: 'bmatrix', label: '[ ]', title: 'Square brackets' },
  { kind: 'vmatrix', label: '| |', title: 'Determinant' },
];

const clamp = (n: number) => Math.max(1, Math.min(MAX_SIZE, n));

/** The brackets of each kind, for a matrix with a line (written as \left( \begin{array}{cc|c} … \end{array} \right)). */
const DELIMS: Record<MatrixKind, [string, string]> = { pmatrix: ['(', ')'], bmatrix: ['[', ']'], vmatrix: ['|', '|'] };

/** The line only where it divides the columns (1 … columns − 1); otherwise none. */
function withBar(m: Matrix, bar: number | undefined): Matrix {
  const cols = m.cells[0]?.length ?? 0;
  return bar && bar >= 1 && bar < cols ? { ...m, bar } : { kind: m.kind, cells: m.cells };
}

export function setBar(m: Matrix, bar: number | undefined): Matrix {
  return withBar(m, bar);
}

export function blankMatrix(rows: number, cols: number, kind: MatrixKind = 'pmatrix'): Matrix {
  return { kind, cells: Array.from({ length: clamp(rows) }, () => Array(clamp(cols)).fill('')) };
}

/** The same matrix at another size; what was typed stays where it was. */
export function resize(m: Matrix, rows: number, cols: number): Matrix {
  const out = blankMatrix(rows, cols, m.kind);
  out.cells.forEach((row, r) => row.forEach((_, c) => (row[c] = m.cells[r]?.[c] ?? '')));
  return withBar(out, m.bar);
}

export function toLatex(m: Matrix): string {
  const rows = m.cells.map(row => row.map(c => c.trim()).join(' & ')).join(' \\\\ ');
  const cols = m.cells[0]?.length ?? 0;
  if (m.bar && m.bar >= 1 && m.bar < cols) {
    const [l, r] = DELIMS[m.kind];
    const spec = 'c'.repeat(m.bar) + '|' + 'c'.repeat(cols - m.bar);
    return `\\left${l} \\begin{array}{${spec}} ${rows} \\end{array} \\right${r}`;
  }
  return `\\begin{${m.kind}} ${rows} \\end{${m.kind}}`;
}

/** Splits on a separator only outside braces, so \text{a & b} stays one cell. */
function splitTop(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s.startsWith(sep, i) === false) { i++; continue; }     // skip escaped characters like \{ or \&
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (depth === 0 && s.startsWith(sep, i)) {
      parts.push(s.slice(start, i));
      start = i + sep.length;
      i += sep.length - 1;
    }
  }
  return [...parts, s.slice(start)];
}

/** The grid for a formula that is exactly one matrix, otherwise null (it opens in the normal formula box). */
export function fromLatex(latex: string): Matrix | null {
  const withLine = latex.trim().match(/^\\left([(\[|])\s*\\begin\{array\}\{(c+)(?:\|(c+))?\}([\s\S]*)\\end\{array\}\s*\\right([)\]|])$/);
  if (withLine) {
    const kind = (Object.keys(DELIMS) as MatrixKind[]).find(k => DELIMS[k][0] === withLine[1] && DELIMS[k][1] === withLine[5]);
    const grid = kind ? readCells(withLine[4], kind) : null;
    const cols = withLine[2].length + (withLine[3]?.length ?? 0);
    if (!grid || grid.cells[0].length !== cols) return null;
    return withBar(grid, withLine[3] ? withLine[2].length : undefined);
  }
  const m = latex.trim().match(/^\\begin\{(pmatrix|bmatrix|vmatrix)\}([\s\S]*)\\end\{\1\}$/);
  return m ? readCells(m[2], m[1] as MatrixKind) : null;
}

function readCells(body: string, kind: MatrixKind): Matrix | null {
  if (/\\(begin|end)\{/.test(body)) return null;
  const rows = splitTop(body, '\\\\').map(r => splitTop(r, '&').map(c => c.trim()));
  if (rows.length > 1 && rows[rows.length - 1].every(c => !c)) rows.pop();      // a trailing \\ isn't a row
  const cols = Math.max(...rows.map(r => r.length));
  if (rows.length > MAX_SIZE || cols > MAX_SIZE) return null;
  return { kind, cells: rows.map(r => [...r, ...Array(cols - r.length).fill('')]) };
}

/** Without the rows and columns left empty at the end (a 3×3 grid with only a 1×2 typed in saves as 1×2). */
export function trimmed(m: Matrix): Matrix {
  const cells = m.cells.map(row => row.map(c => c.trim()));
  const used = (r: number, c: number) => !!cells[r]?.[c];
  let rows = cells.length, cols = cells[0]?.length ?? 0;
  while (rows > 1 && cells[rows - 1].every(c => !c)) rows--;
  while (cols > 1 && cells.slice(0, rows).every((_, r) => !used(r, cols - 1))) cols--;
  return withBar({ kind: m.kind, cells: cells.slice(0, rows).map(row => row.slice(0, cols)) }, m.bar);
}

/** The symbols that can stand between matrices in the grid editor (A + B = C). */
export const OPS: { tex: string; label: string }[] = [
  { tex: '+', label: '+' }, { tex: '-', label: '−' }, { tex: '\\cdot', label: '·' }, { tex: '\\times', label: '×' },
  { tex: '=', label: '=' },
];

/** Every matrix in a formula with where it starts and ends (matrices inside other environments are skipped). */
export function findMatrices(latex: string): { start: number; end: number; m: Matrix }[] {
  const out: { start: number; end: number; m: Matrix }[] = [];
  const re = /\\(begin|end)\{([a-zA-Z*]+)\}/g;
  let depth = 0, start = -1, kind = '', hit: RegExpExecArray | null;
  while ((hit = re.exec(latex))) {
    if (hit[1] === 'begin') {
      if (depth === 0) { start = hit.index; kind = hit[2]; }
      depth++;
    } else if (depth > 0 && --depth === 0) {
      let from = start, to = re.lastIndex;
      if (kind === 'array') {                       // a matrix with a line: \left( \begin{array}{cc|c} … \end{array} \right)
        const before = /\\left[(\[|]\s*$/.exec(latex.slice(0, start));
        const after = /^\s*\\right[)\]|]/.exec(latex.slice(to));
        if (!before || !after) continue;
        from = before.index;
        to += after[0].length;
        re.lastIndex = to;
      }
      const m = /^([pbv]matrix|array)$/.test(kind) ? fromLatex(latex.slice(from, to)) : null;
      if (m) out.push({ start: from, end: to, m });
    }
  }
  return out;
}

export function chainToLatex(items: Matrix[], ops: string[]): string {
  return items.map((m, i) => (i ? ` ${ops[i - 1] ?? '+'} ` : '') + toLatex(m)).join('');
}

/** Matrices joined only by + − · × =, for the grid editor; anything else (A = …, numbers) stays in the formula box. */
export function fromChain(latex: string): { items: Matrix[]; ops: string[] } | null {
  const found = findMatrices(latex);
  if (!found.length || latex.slice(0, found[0].start).trim() || latex.slice(found[found.length - 1].end).trim()) return null;
  const ops: string[] = [];
  for (let i = 1; i < found.length; i++) {
    const op = latex.slice(found[i - 1].end, found[i].start).trim();
    if (!OPS.some(o => o.tex === op)) return null;
    ops.push(op);
  }
  return { items: found.map(f => f.m), ops };
}
