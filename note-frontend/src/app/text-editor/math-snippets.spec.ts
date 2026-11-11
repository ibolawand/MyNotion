import katex from 'katex';
import { MATH_SNIPPETS } from './text-editor';

describe('Formula box buttons', () => {
  it('has a bar over a letter (x̄, a mean or a constant like C̄)', () => {
    const bar = MATH_SNIPPETS.find(sn => sn.tex.startsWith('\\overline'));
    expect(bar).toBeDefined();
    // the placeholder letter is selected, so typing replaces it
    expect(bar!.tex.substr(bar!.at!, bar!.sel!)).toBe('x');
  });

  it('every placeholder selection points at a letter inside braces', () => {
    for (const sn of MATH_SNIPPETS.filter(s => s.at != null)) {
      expect(sn.tex[sn.at! - 1]).withContext(sn.label).toBe('{');
      expect(sn.tex[sn.at! + sn.sel!]).withContext(sn.label).toBe('}');
    }
  });

  it('every button draws with KaTeX', () => {
    for (const sn of MATH_SNIPPETS) {
      expect(() => katex.renderToString(sn.face ?? sn.tex, { throwOnError: true })).withContext(sn.label).not.toThrow();
    }
  });
});
