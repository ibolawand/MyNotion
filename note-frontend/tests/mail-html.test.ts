// Run with: node --test tests/mail-html.test.ts  (Node strips the types; no browser needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockRemoteImages, mailDocument } from '../src/app/inbox/mail-html.ts';

test('remote images are removed, embedded ones kept', () => {
  const html = '<img src="https://track.example/p.gif"><img src="cid:logo"><img src="data:image/png;base64,AA">' +
               '<img srcset="https://a/1x.png 1x, https://a/2x.png 2x" src="http://x/y.png">' +
               '<div style="background:url(https://t.example/bg.png)">hi</div>';
  const out = blockRemoteImages(html);
  assert.ok(!/https?:\/\//.test(out), out);
  assert.ok(out.includes('src="cid:logo"'));
  assert.ok(out.includes('data:image/png;base64,AA'));
  assert.ok(out.includes('>hi</div>'));
});

test('links open outside, and nothing can run', () => {
  const doc = mailDocument('<a href="https://school.example">x</a><script>alert(1)</script>', false);
  assert.ok(doc.includes('<base target="_blank">'));
  assert.ok(!doc.includes('<script>alert'));
  assert.ok(doc.includes('Content-Security-Policy'));
});

test('show images keeps them', () => {
  assert.ok(mailDocument('<img src="https://a/b.png">', true).includes('https://a/b.png'));
});

test('html to plain text keeps the lines (for quoting a reply)', async () => {
  const { htmlToPlain } = await import('../src/app/inbox/mail-html.ts');
  assert.equal(htmlToPlain('<p>Hi Lala,</p><p>the deadline is <b>Friday</b>.</p><p>Best,<br>F. Huber</p><style>p{}</style>'),
               'Hi Lala,\n\nthe deadline is Friday.\n\nBest,\nF. Huber');
  assert.equal(htmlToPlain('a &amp; b&nbsp;c'), 'a & b c');
});
