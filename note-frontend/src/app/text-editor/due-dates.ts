/**
 * Due dates on to-do items: "Finish the essay · due Fri 13 Nov".
 *
 * The date is plain text at the end of a checklist item, so Aria (BetterAI/Engines/DueDates.py, same rules — keep
 * the two in step) can read and write it, and it stays readable anywhere. Here it gets:
 *   - a coloured chip in the editor (overdue / today / soon / later), drawn as a decoration, the text is unchanged
 *   - typing "due friday ", "due tomorrow ", "due next monday ", "due in 3 days " turns the day into a date, because
 *     a relative day saved in a note would mean something else next week
 *   - the calendar shows open to-dos on the day they're due (dueTasksIn)
 */
import { Extension, InputRule } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MON = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
const DATE = `\\d{1,2}(?:st|nd|rd|th)?\\s+${MON}(?:\\s+\\d{4})?|\\d{1,2}\\.\\d{1,2}\\.(?:\\d{2,4})?|\\d{4}-\\d{1,2}-\\d{1,2}`;

/** Same as DUE_RE in DueDates.py: the tag at the end of the item, with an optional separator before it. */
export const DUE_RE = new RegExp(
  `\\s*(?:[·•—–\\-|,(]\\s*)?\\bdue\\s+(?:on\\s+)?(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\\s+)?(${DATE})\\s*\\)?\\s*$`, 'i');

function day0(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((day0(b).getTime() - day0(a).getTime()) / 86400000);
}

function valid(y: number, m: number, d: number): Date | null {
  const out = new Date(y, m - 1, d);
  return out.getMonth() === m - 1 && out.getDate() === d ? out : null;
}

/** A date written without a year: the one nearest to today (so last week's overdue task stays last week's). */
function closestYear(month: number, day: number, today: Date): Date | null {
  let best: Date | null = null;
  for (const y of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
    const d = valid(y, month, day);
    if (d && (!best || Math.abs(daysBetween(today, d)) < Math.abs(daysBetween(today, best)))) best = d;
  }
  return best;
}

export function parseDueText(s: string, today = new Date()): Date | null {
  s = s.trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})?$/);
  if (m) {
    if (m[3]) { const y = +m[3]; return valid(y < 100 ? y + 2000 : y, +m[2], +m[1]); }
    return closestYear(+m[2], +m[1], today);
  }
  m = s.match(new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MON})(?:\\s+(\\d{4}))?$`));
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3)) + 1;
    return m[3] ? valid(+m[3], month, +m[1]) : closestYear(month, +m[1], today);
  }
  return null;
}

export function splitDue(text: string, today = new Date()): { text: string; due: Date | null; tagStart: number } {
  const m = DUE_RE.exec(text);
  const due = m ? parseDueText(m[1], today) : null;
  if (!m || !due) return { text: text.trim(), due: null, tagStart: -1 };
  return { text: text.slice(0, m.index).trim(), due, tagStart: m.index };
}

export function dueTag(d: Date, today = new Date()): string {
  const month = MONTHS[d.getMonth()];
  let tag = `due ${DAYS3[d.getDay()]} ${d.getDate()} ${month[0].toUpperCase()}${month.slice(1)}`;
  const guess = closestYear(d.getMonth() + 1, d.getDate(), today);
  if (!guess || guess.getFullYear() !== d.getFullYear()) tag += ` ${d.getFullYear()}`;
  return tag;
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

export function dueState(d: Date, today = new Date()): DueState {
  const n = daysBetween(today, d);
  return n < 0 ? 'overdue' : n === 0 ? 'today' : n <= 2 ? 'soon' : 'later';
}

/** For a tooltip: "due today", "due tomorrow", "due in 4 days", "2 days overdue". */
export function dueLabel(d: Date, today = new Date()): string {
  const n = daysBetween(today, d);
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  if (n === -1) return 'Was due yesterday';
  return n < 0 ? `${-n} days overdue` : `Due in ${n} days`;
}

/** "friday", "next monday", "tomorrow", "in 3 days", "in 2 weeks" -> a date. */
export function relativeDay(words: string, today = new Date()): Date | null {
  const s = words.trim().toLowerCase();
  const t = day0(today);
  const plus = (n: number) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + n);
  if (s === 'today' || s === 'tonight') return t;
  if (s === 'tomorrow') return plus(1);
  let m = s.match(/^in (\d+|a|one|two|three) (days?|weeks?)$/);
  if (m) {
    const n = ({ a: 1, one: 1, two: 2, three: 3 } as Record<string, number>)[m[1]] ?? +m[1];
    return plus(n * (m[2].startsWith('week') ? 7 : 1));
  }
  m = s.match(/^(?:next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (m) return plus(((WEEKDAYS.indexOf(m[1]) - t.getDay() + 7) % 7) || 7);
  return null;
}

// ── the chip and the "due friday" rule in the editor ─────────────────────────────

const dueKey = new PluginKey('dueDates');

function decorate(doc: PMNode): DecorationSet {
  const today = new Date();
  const decos: Decoration[] = [];
  doc.descendants((node, pos, parent) => {
    // only the paragraph directly inside a to-do item: elsewhere "due 13 Nov" is just text
    if (!node.isTextblock || parent?.type.name !== 'taskItem') return true;
    const text = node.textContent;
    const { due, tagStart } = splitDue(text, today);
    if (!due) return false;
    const lead = text.slice(tagStart).search(/due/i);
    const from = pos + 1 + tagStart + lead;
    const to = pos + 1 + text.trimEnd().length;
    const state = dueState(due, today);
    const done = !!(parent && parent.attrs['checked']);
    decos.push(Decoration.inline(from, to, {
      class: `due-chip due-${done ? 'done' : state}`,
      title: done ? 'Done' : dueLabel(due, today),
    }));
    return false;
  });
  return DecorationSet.create(doc, decos);
}

export const DueDates = Extension.create({
  name: 'dueDates',

  addInputRules() {
    return [
      new InputRule({
        // "due friday␣" / "due next monday␣" / "due tomorrow␣" / "due in 3 days␣" inside a to-do item
        find: /\bdue\s+((?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|today|tonight|tomorrow|in\s+(?:\d+|a|one|two|three)\s+(?:days?|weeks?))\s$/i,
        handler: ({ state, range, match }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.node(-1)?.type.name !== 'taskItem') return null;
          const d = relativeDay(match[1].replace(/\s+/g, ' '));
          if (!d) return null;
          state.tr.insertText(dueTag(d) + ' ', range.from, range.to);
          return undefined;
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: dueKey,
        state: {
          init: (_, { doc }) => decorate(doc),
          // a ticked box changes only attributes, which also counts as docChanged
          apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old),
        },
        props: { decorations: state => dueKey.getState(state) },
      }),
    ];
  },
});

// ── for the calendar ────────────────────────────────────────────────────────────

export interface DueTask { noteId: number; noteTitle: string; text: string; due: Date; iso: string; }

function iso(d: Date): string {
  const p = (n: number) => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Open (unticked) to-dos with a due date, from the notes' HTML. */
export function dueTasksIn(notes: { id?: number; title: string; content: string }[], today = new Date()): DueTask[] {
  const out: DueTask[] = [];
  const parser = new DOMParser();
  for (const n of notes) {
    if (!n.content || !/data-type="taskItem"/i.test(n.content) || !/\bdue\b/i.test(n.content)) continue;
    const dom = parser.parseFromString(n.content, 'text/html');
    dom.querySelectorAll('li[data-type="taskItem"]').forEach(li => {
      if (li.getAttribute('data-checked') === 'true') return;
      const p = li.querySelector(':scope > div > p, :scope > div');
      const { text, due } = splitDue((p?.textContent ?? '').replace(/\s+/g, ' '), today);
      if (due && n.id != null) out.push({ noteId: n.id, noteTitle: n.title, text, due, iso: iso(due) });
    });
  }
  return out;
}
