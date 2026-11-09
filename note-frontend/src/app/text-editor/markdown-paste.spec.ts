import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { InlineMath } from '@tiptap/extension-mathematics';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { AlignedBlockMath } from './aligned-math';
import { NOTE_TABLE } from './note-table';
import { looksLikeMarkdown, markdownToHtml } from './markdown-paste';

describe('pasting Markdown', () => {
  let editor: Editor;
  const paste = (text: string) => {
    editor = new Editor({ element: document.createElement('div'), content: '<p></p>',
      extensions: [StarterKit.configure({ trailingNode: false }), InlineMath, AlignedBlockMath, TaskList, TaskItem, ...NOTE_TABLE] });
    editor.commands.insertContent(markdownToHtml(text));
    return editor.getHTML();
  };
  afterEach(() => editor?.destroy());

  it('only plain text that really is Markdown', () => {
    expect(looksLikeMarkdown('## Zusammenfassung\nText')).toBe(true);
    expect(looksLikeMarkdown('- Milch\n- Brot')).toBe(true);
    expect(looksLikeMarkdown('Das ist **wichtig**.')).toBe(true);
    expect(looksLikeMarkdown('Die Formel $$a^2+b^2=c^2$$')).toBe(true);
    expect(looksLikeMarkdown('Just a normal sentence, costs $5.')).toBe(false);
    expect(looksLikeMarkdown('2 * 3 = 6')).toBe(false);
  });

  it('headings, bold, lists and links', () => {
    const html = paste('## Zellen\n\nDie **Zellmembran** ist *wichtig*.\n\n1. erst\n2. dann\n\n- a\n- b\n\n[Quelle](https://example.com)');
    expect(html).toContain('<h2>Zellen</h2>');
    expect(html).toContain('<strong>Zellmembran</strong>');
    expect(html).toContain('<em>wichtig</em>');
    expect(html).toMatch(/<ol><li><p>erst<\/p><\/li><li><p>dann<\/p><\/li><\/ol>/);
    expect(html).toContain('href="https://example.com"');
  });

  it('formulas the way ChatGPT writes them become real formulas', () => {
    const html = paste('Satz des Pythagoras: $a^2+b^2=c^2$ und \\(x_1\\).\n\n$$\\frac{a}{b}$$\n\n\\[ \\sqrt{2} \\]');
    expect(html).toContain('data-latex="a^2+b^2=c^2"');
    expect(html).toContain('data-latex="x_1"');
    expect(html).toMatch(/<div data-latex="\\frac\{a\}\{b\}"[^>]*data-type="block-math"/);
    expect(html).toContain('data-latex="\\sqrt{2}"');
    expect(html).not.toContain('MNFORMULA');
  });

  it('money is not a formula, and code keeps its dollar signs', () => {
    const html = paste('It costs $5 and $6.\n\n`echo $HOME$`');
    expect(html).toContain('It costs $5 and $6.');
    expect(html).toContain('<code>echo $HOME$</code>');
    expect(html).not.toContain('math');
  });

  it('to-do lists and tables', () => {
    const html = paste('- [x] Hausaufgaben\n- [ ] Lernen\n\n| Fach | Note |\n|---|---|\n| Bio | 5.5 |');
    expect(html).toContain('data-type="taskList"');
    expect(html).toMatch(/data-checked="true".*Hausaufgaben.*data-checked="false".*Lernen/);
    expect(html).toMatch(/<th[^>]*><p>Fach<\/p><\/th>/);
    expect(html).toMatch(/<td[^>]*><p>5.5<\/p><\/td>/);
  });

  it('HTML inside the text stays text', () => {
    const html = paste('## Hi\n\n<img src="https://evil.example/x.png" onerror="alert(1)">\n\n<script>alert(1)</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img');
  });
});
