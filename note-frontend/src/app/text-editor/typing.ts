/** Typing shortcuts for the signs school notes need: -> → , => ⇒ , <=> ⇔ , != ≠ , <= ≤ , >= ≥ , ~= ≈ , +/- ± ,
 *  ... … , -- — , 1/2 ½ , 2x3 2×3. Backspace right after one turns it back into what was typed.
 *  Left out on purpose: curly quotes (English ones would be wrong in German text), (c) → © (exercise labels are
 *  written "(c)"), and ^2 → ² (inside $$…$$ the formula needs the ^2). Never inside code. */
import { Extension, textInputRule } from '@tiptap/core';
import Typography from '@tiptap/extension-typography';

const MORE: { find: RegExp; replace: string }[] = [
  { find: /=>$/, replace: '⇒' },
  { find: /≤>$/, replace: '⇔' },      // "<=" became ≤ as the = was typed; the > makes it <=>
  { find: /←>$/, replace: '↔' },      // the same for <->
  { find: /<=$/, replace: '≤' },
  { find: />=$/, replace: '≥' },
  { find: /~=$/, replace: '≈' },
];

export const MathTyping = Extension.create({
  name: 'mathTyping',
  addInputRules() {
    return MORE.map(r => textInputRule(r));
  },
});

export const NOTE_TYPING = [
  Typography.configure({
    openDoubleQuote: false, closeDoubleQuote: false, openSingleQuote: false, closeSingleQuote: false,
    copyright: false, trademark: false, servicemark: false, registeredTrademark: false,
    superscriptTwo: false, superscriptThree: false, laquo: false, raquo: false,
  }),
  MathTyping,
];
