import { ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Note } from '../../model/models';
import { NoteService } from '../../services/NoteService';
import { ModelService } from '../model.service';

/** One result: the note, and the matching bit of text split around the match (so nothing is set as HTML). */
interface Hit {
  note: Note;
  title: string;
  before: string;
  match: string;
  after: string;
  score: number;
}

const DAILY_TEMPLATE =
  '<h2>Plan</h2><ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label>' +
  '<input type="checkbox"><span></span></label><div><p></p></div></li></ul><h2>Notes</h2><p></p>';

function plainText(html: string): string {
  return (html || '')
    .replace(/<(br|\/p|\/h\d|\/li|\/blockquote|\/pre)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** text[from, from+n], with "…" when there's more after it. */
function cut(text: string, from: number, n: number): string {
  return text.slice(from, from + n) + (text.length > from + n ? '…' : '');
}

/** "Friday, 7 November 2026": the title of today's note (Aria can find it by that name too). */
export function dailyTitle(d = new Date()): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/^(\w+) /, '$1, ');
}

@Component({
  selector: 'app-quick-search',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './quick-search.html',
  styleUrl: './quick-search.css'
})
export class QuickSearch implements OnInit, OnDestroy {
  @ViewChild('input') input?: ElementRef<HTMLInputElement>;
  @ViewChild('list') list?: ElementRef<HTMLElement>;

  open = false;
  query = '';
  hits: Hit[] = [];
  index = 0;                 // 0 = "Today's note" row when it's shown, results after it
  readonly today = dailyTitle();
  private texts = new Map<number, { html: string; text: string }>();
  private onFocusIn = (e: FocusEvent) => this.zone.run(() => this.sidebarFocus(e));

  constructor(private noteService: NoteService, private modelService: ModelService, private zone: NgZone,
              private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // The top bar's "Search notes…" box opens this search.
    document.addEventListener('focusin', this.onFocusIn);
  }

  ngOnDestroy() {
    document.removeEventListener('focusin', this.onFocusIn);
  }

  private sidebarFocus(e: FocusEvent) {
    const el = e.target as HTMLElement | null;
    if (el instanceof HTMLInputElement && el.closest('app-top-bar .search-box')) {
      const typed = el.value;
      el.blur();
      this.show(typed);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      this.open ? this.close() : this.show();
    } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      this.close();
      this.modelService.toggleOpenNewNote();
    } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      this.close();
      this.openToday();
    } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      this.modelService.toggleAriaPanel();      // talk to Aria; the panel takes the cursor when it opens
    }
  }

  show(query = '') {
    this.query = query;
    this.open = true;
    this.search();
    this.cdr.detectChanges();              // render the box now and focus it, so the first keystroke isn't lost
    this.input?.nativeElement.focus();
  }

  close() {
    this.open = false;
  }

  get showToday(): boolean {
    const q = this.query.trim().toLowerCase();
    return !q || 'today'.startsWith(q) || "today's note".startsWith(q) || this.today.toLowerCase().includes(q);
  }

  get rowCount(): number {
    return this.hits.length + (this.showToday ? 1 : 0);
  }

  private textOf(note: Note): string {
    const cached = note.id != null ? this.texts.get(note.id) : undefined;
    if (cached && cached.html === note.content) return cached.text;
    const text = plainText(note.content);
    if (note.id != null) this.texts.set(note.id, { html: note.content, text });
    return text;
  }

  search() {
    const notes = [...this.noteService.getNotesCache()];
    const q = this.query.trim().toLowerCase();
    this.index = 0;
    if (!q) {
      // recent notes first
      notes.sort((a: any, b: any) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
      this.hits = notes.slice(0, 8).map(n => {
        const text = this.textOf(n);
        return { note: n, title: n.title || 'Untitled', before: cut(text, 0, 90), match: '', after: '', score: 0 };
      });
      return;
    }
    const words = q.split(/\s+/).filter(Boolean);
    const hits: Hit[] = [];
    for (const n of notes) {
      const title = (n.title || 'Untitled');
      const lowTitle = title.toLowerCase();
      const text = this.textOf(n);
      const low = text.toLowerCase();
      if (!words.every(w => lowTitle.includes(w) || low.includes(w))) continue;
      let score = 0;
      for (const w of words) {
        if (lowTitle.startsWith(w)) score += 12;
        else if (lowTitle.includes(w)) score += 8;
        score += Math.min(5, low.split(w).length - 1);
      }
      if (lowTitle.includes(q)) score += 10;
      // snippet around the first match in the text (the phrase if it's there, else the first word that is)
      let at = low.indexOf(q), len = q.length;
      if (at < 0) {
        const w = words.find(x => low.includes(x));
        at = w ? low.indexOf(w) : -1;
        len = w ? w.length : 0;
      }
      let before = '', match = '', after = '';
      if (at >= 0) {
        const start = Math.max(0, at - 40);
        before = (start > 0 ? '…' : '') + text.slice(start, at);
        match = text.slice(at, at + len);
        after = cut(text, at + len, 70);
      } else {
        before = cut(text, 0, 90);
      }
      hits.push({ note: n, title, before, match, after, score });
    }
    hits.sort((a, b) => b.score - a.score);
    this.hits = hits.slice(0, 12);
  }

  onInputKey(e: KeyboardEvent) {
    const n = this.rowCount;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (n) this.index = (this.index + 1) % n;
      this.scrollIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) this.index = (this.index - 1 + n) % n;
      this.scrollIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.choose(this.index);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  private scrollIntoView() {
    setTimeout(() => this.list?.nativeElement.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest' }), 0);
  }

  choose(i: number) {
    if (this.showToday && i === 0) {
      this.close();
      this.openToday();
      return;
    }
    const hit = this.hits[i - (this.showToday ? 1 : 0)];
    if (!hit) return;
    this.close();
    this.modelService.onNoteClicked(hit.note);
  }

  /** Opens today's note, creating it from a small template the first time each day. */
  async openToday() {
    const title = dailyTitle();
    let note = this.noteService.getNotesCache().find(n => (n.title || '').trim() === title);
    if (!note) {
      const fresh: Note = { title, content: DAILY_TEMPLATE, categoryID: 0, folderID: 0 };
      const res: any = await this.noteService.createNote(fresh);
      if (!res?.ok) return;
      note = fresh;
    }
    this.modelService.onNoteClicked(note);
  }
}
