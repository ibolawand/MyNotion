import { blankMatrix, chainToLatex, findMatrices, fromChain, fromLatex, resize, toLatex, trimmed } from './matrix';

describe('matrix', () => {
  it('writes a grid as LaTeX', () => {
    expect(toLatex({ kind: 'pmatrix', cells: [['1', '0'], ['0', '1']] }))
      .toBe('\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}');
    expect(toLatex({ kind: 'bmatrix', cells: [[' a ', '\\frac{1}{2}']] }))
      .toBe('\\begin{bmatrix} a & \\frac{1}{2} \\end{bmatrix}');
  });

  it('reads a matrix formula back into a grid', () => {
    expect(fromLatex('\\begin{vmatrix} 1 & 2 \\\\ 3 & 4 \\end{vmatrix}'))
      .toEqual({ kind: 'vmatrix', cells: [['1', '2'], ['3', '4']] });
  });

  it('keeps & and \\\\ inside braces as part of one cell', () => {
    expect(fromLatex('\\begin{pmatrix} \\text{a & b} & x \\\\ {y \\\\ z} & 2 \\end{pmatrix}'))
      .toEqual({ kind: 'pmatrix', cells: [['\\text{a & b}', 'x'], ['{y \\\\ z}', '2']] });
  });

  it('pads short rows, so the grid is always rectangular', () => {
    expect(fromLatex('\\begin{bmatrix} 1 & 2 & 3 \\\\ 4 \\end{bmatrix}'))
      .toEqual({ kind: 'bmatrix', cells: [['1', '2', '3'], ['4', '', '']] });
  });

  it('only opens the grid for a formula that is just one matrix', () => {
    expect(fromLatex('A = \\begin{pmatrix} 1 \\end{pmatrix}')).toBeNull();
    expect(fromLatex('\\frac{a}{b}')).toBeNull();
    expect(fromLatex('\\begin{pmatrix} 1 \\end{pmatrix} \\begin{pmatrix} 2 \\end{pmatrix}')).toBeNull();
    expect(fromLatex('\\begin{pmatrix} \\begin{pmatrix} 1 \\end{pmatrix} \\end{pmatrix}')).toBeNull();
  });

  it('round-trips', () => {
    const m = { kind: 'bmatrix' as const, cells: [['x^2', '-1'], ['\\sqrt{2}', '0']] };
    expect(fromLatex(toLatex(m))).toEqual(m);
  });

  it('grows and shrinks, keeping what was typed', () => {
    const m = blankMatrix(2, 2);
    expect(m).toEqual({ kind: 'pmatrix', cells: [['', ''], ['', '']] });
    m.cells[0][0] = '7';
    expect(resize(m, 3, 3).cells).toEqual([['7', '', ''], ['', '', ''], ['', '', '']]);
    expect(resize(m, 1, 1).cells).toEqual([['7']]);
    expect(resize(m, 0, 99).cells.length).toBe(1);          // at least 1×1, at most 10×10
    expect(resize(m, 0, 99).cells[0].length).toBe(10);
  });

  it('drops rows and columns left empty at the end, but keeps gaps in the middle', () => {
    expect(trimmed({ kind: 'pmatrix', cells: [['a', 'b', ''], ['', '', ''], ['', '', '']] }).cells).toEqual([['a', 'b']]);
    expect(trimmed({ kind: 'pmatrix', cells: [['a', '', 'c'], ['', ' ', ''], ['1', '', '']] }).cells)
      .toEqual([['a', '', 'c'], ['', '', ''], ['1', '', '']]);
    expect(trimmed(blankMatrix(3, 3)).cells).toEqual([['']]);
  });

  it('finds each matrix inside a bigger formula, with where it is', () => {
    const f = 'A = \\begin{pmatrix} 1 & 2 \\end{pmatrix} + \\frac{1}{2} \\begin{bmatrix} x \\\\ y \\end{bmatrix}';
    const found = findMatrices(f);
    expect(found.map(x => x.m)).toEqual([{ kind: 'pmatrix', cells: [['1', '2']] }, { kind: 'bmatrix', cells: [['x'], ['y']] }]);
    expect(f.slice(found[0].start, found[0].end)).toBe('\\begin{pmatrix} 1 & 2 \\end{pmatrix}');
    expect(f.slice(found[1].end)).toBe('');
    expect(findMatrices('\\begin{cases} a \\end{cases} x^2')).toEqual([]);
  });

  it('writes and reads matrices joined by + − · × =', () => {
    const a = { kind: 'pmatrix' as const, cells: [['1']] }, b = { kind: 'bmatrix' as const, cells: [['2']] };
    const tex = chainToLatex([a, b, a], ['+', '=']);
    expect(tex).toBe('\\begin{pmatrix} 1 \\end{pmatrix} + \\begin{bmatrix} 2 \\end{bmatrix} = \\begin{pmatrix} 1 \\end{pmatrix}');
    expect(fromChain(tex)).toEqual({ items: [a, b, a], ops: ['+', '='] });
    expect(fromChain('\\begin{pmatrix} 1 \\end{pmatrix} \\cdot \\begin{pmatrix} 1 \\end{pmatrix}')!.ops).toEqual(['\\cdot']);
    expect(fromChain('\\begin{pmatrix} 1 \\end{pmatrix}')).toEqual({ items: [a], ops: [] });
  });

  it('leaves anything else in the formula box: names, numbers, other symbols', () => {
    expect(fromChain('A = \\begin{pmatrix} 1 \\end{pmatrix}')).toBeNull();
    expect(fromChain('\\begin{pmatrix} 1 \\end{pmatrix} + 3')).toBeNull();
    expect(fromChain('\\begin{pmatrix} 1 \\end{pmatrix} \\begin{pmatrix} 1 \\end{pmatrix}')).toBeNull();
    expect(fromChain('x^2')).toBeNull();
  });
});
