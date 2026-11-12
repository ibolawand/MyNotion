import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { Folder, Note } from '../../model/models';
import { NoteService } from '../../services/NoteService';
import { ModelService } from '../model.service';
import { Bookshelf, SHELF_SCENE, SceneFactory } from './bookshelf';
import { ShelfScene } from './shelf-scene';

describe('Bookshelf', () => {
  let fixture: ComponentFixture<Bookshelf>;
  let model: ModelService;
  let notes$: BehaviorSubject<Note[]>;
  let folderChanged$: Subject<void>;
  let folders: Folder[];
  let updated: Note[];
  let sceneCalls: string[];
  let opened: () => void;

  const folder = (id: number, name: string, colour = '#4ade80', parentID: number | null = null): Folder =>
    ({ id, name, colour, parentID, userID: 1 });
  const note = (id: number, title: string, folderID: number, content = ''): Note => ({ id, title, content, categoryID: 0, folderID });
  const el = () => fixture.nativeElement as HTMLElement;
  const all = <T extends HTMLElement = HTMLButtonElement>(sel: string) => Array.from(el().querySelectorAll<T>(sel));
  const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const key = (k: string) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    (document.activeElement ?? el()).dispatchEvent(e);
  };

  const fakeScene: SceneFactory = (_c, shelf, opts) => {
    let current = shelf, fanned = false;
    const scene: ShelfScene = {
      update: s => { current = s; sceneCalls.push('update'); },
      resize: () => sceneCalls.push('resize'),
      rects: () => [
        ...current.books.map((b, i) => ({ key: `book:${b.folder.id}`, x: 10 + i * 50, y: 20, w: 40, h: 120 })),
        ...current.slips.map((n, i) => ({ key: `slip:${n.id}`, x: 10 + i * 60, y: 200, w: 50, h: 60 })),
        ...(fanned ? current.aria.map((n, i) => ({ key: `aria:${n.id}`, x: 300 + i * 60, y: 200, w: 50, h: 60 }))
          : current.aria.length ? [{ key: 'aria', x: 400, y: 200, w: 50, h: 60 }] : []),
      ],
      highlight: k => sceneCalls.push(`highlight:${k}`),
      fan: o => { fanned = o; sceneCalls.push(`fan:${o}`); },
      open: id => { sceneCalls.push(`open:${id}`); return new Promise<void>(r => { opened = r; }); },
      dispose: () => sceneCalls.push('dispose'),
    };
    sceneCalls.push(`start:${opts.returnFrom ?? '-'}`);
    return scene;
  };

  async function make(scene: SceneFactory | null, list: Note[], lastBook: number | null = null) {
    notes$ = new BehaviorSubject<Note[]>(list);
    folderChanged$ = new Subject<void>();
    updated = [];
    sceneCalls = [];
    const noteService = {
      notes$, folderChanged$,
      loadFolders: async () => folders,
      updateNote: async (n: Note) => { updated.push(n); return { ok: true }; },
    };
    await TestBed.configureTestingModule({
      imports: [Bookshelf],
      providers: [{ provide: NoteService, useValue: noteService }, { provide: SHELF_SCENE, useValue: scene }],
    }).compileComponents();
    model = TestBed.inject(ModelService);
    model.lastBookId = lastBook;
    fixture = TestBed.createComponent(Bookshelf);
    fixture.detectChanges();
    await settle();
  }

  beforeEach(() => {
    folders = [folder(3, 'Math'), folder(5, 'German', '#ef4444'), folder(11, 'Sub', '#4ade80', 3)];
  });

  const sample = () => [note(8, 'Schularbeiten', 3), note(13, 'Differentialgleichung', 11), note(20, 'Aufsatz', 5),
    note(1, 'sada', 0, '<p>loose <b>text</b></p>'), note(5, 'Shopping list', 0, '<p>milk</p>'), note(6, 'Inbox', 0)];

  describe('without 3D (flat)', () => {
    it('shows one book per notebook, in its colour, with its name', async () => {
      await make(null, sample());
      const books = all('.book');
      expect(books.map(b => b.querySelector('.spine-name')!.textContent)).toEqual(['Math', 'German']);
      expect(books[1].style.getPropertyValue('--cover')).toBe('#ef4444');
      expect(books[0].getAttribute('aria-label')).toBe('Open Math, 2 notes');
      expect(el().querySelector('.shelf')!.classList).toContain('flat');
    });

    it('a click opens the book', async () => {
      await make(null, sample());
      const open = spyOn(model, 'openBook').and.callThrough();
      all('.book')[0].click();
      await settle();
      expect(open).toHaveBeenCalledOnceWith(folders[0], [11]);
    });

    it('arrow keys walk along the books and slips', async () => {
      await make(null, sample());
      const picks = all('button.pick');
      picks[0].focus();
      key('ArrowRight');
      expect(document.activeElement).toBe(picks[1]);
      key('ArrowLeft');
      expect(document.activeElement).toBe(picks[0]);
      key('ArrowLeft');
      expect(document.activeElement).toBe(picks[picks.length - 1]);      // wraps around
    });

    it('loose notes lie on the desk as slips and open as a note', async () => {
      await make(null, sample());
      const slips = all('.desk > .slip');
      expect(slips.length).toBe(1);
      expect(slips[0].textContent).toContain('sada');
      expect(slips[0].textContent).toContain('loose text');
      const clicked = spyOn(model, 'onNoteClicked').and.callThrough();
      slips[0].click();
      expect(clicked.calls.mostRecent().args[0].id).toBe(1);
    });

    it('Aria\'s notes are a stack that fans out', async () => {
      await make(null, sample());
      expect(all('.aria-stack .slip').length).toBe(0);
      all('.aria-stack .stack-top')[0].click();
      fixture.detectChanges();
      expect(el().querySelector('.aria-stack')!.classList).toContain('fanned');
      expect(all('.aria-stack .slip').map(s => s.querySelector('.slip-title')!.textContent)).toEqual(['Shopping list', 'Inbox']);
      const clicked = spyOn(model, 'onNoteClicked').and.callThrough();
      all('.aria-stack .slip')[1].click();
      expect(clicked.calls.mostRecent().args[0].id).toBe(6);
    });

    it('an empty desk shows nothing, and no notebooks a hint', async () => {
      folders = [];
      await make(null, []);
      expect(all('.desk > *').length).toBe(0);
      expect(el().querySelector('.aria-stack')).toBeNull();
      expect(el().textContent).toContain('No notebooks yet');
    });

    it('a slip dropped on a book moves into that notebook', async () => {
      await make(null, sample());
      const data = new DataTransfer();
      all('.desk > .slip')[0].dispatchEvent(new DragEvent('dragstart', { dataTransfer: data, bubbles: true }));
      const over = new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true });
      all('.book')[1].dispatchEvent(over);
      expect(over.defaultPrevented).toBeTrue();
      all('.book')[1].dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
      await settle();
      expect(updated.map(n => [n.id, n.folderID])).toEqual([[1, 5]]);
    });

    it('something else dragged over a book is not taken', async () => {
      await make(null, sample());
      const data = new DataTransfer();
      data.setData('text/plain', 'hello');
      const over = new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true });
      all('.book')[0].dispatchEvent(over);
      expect(over.defaultPrevented).toBeFalse();
      all('.book')[0].dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
      await settle();
      expect(updated).toEqual([]);
    });

    it('long names and many notebooks still fit', async () => {
      const long = 'A very long notebook name that goes on and on and on and on and on and on and on';
      folders = [folder(1, long), ...Array.from({ length: 30 }, (_, i) => folder(100 + i, 'Book ' + i))];
      await make(null, []);
      expect(all('.book').length).toBe(31);
      expect(all('.book')[0].title).toBe(long);
      const row = el().querySelector<HTMLElement>('.shelf-row')!;
      expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
    });

    it('follows changes to the notes and notebooks', async () => {
      await make(null, sample());
      const first = all('.book')[0];
      notes$.next([...sample(), note(40, 'Neu', 5)]);
      fixture.detectChanges();
      expect(all('.book')[1].getAttribute('aria-label')).toBe('Open German, 2 notes');
      expect(all('.book')[0]).toBe(first);                 // the same button, not a new shelf
      folders = [...folders, folder(7, 'loal', '#ec4899')];
      folderChanged$.next();
      await settle();
      expect(all('.book').length).toBe(3);
    });
  });

  describe('with the 3D scene', () => {
    it('lays the buttons over the drawn books', async () => {
      await make(fakeScene, sample());
      expect(el().querySelector('.shelf')!.classList).not.toContain('flat');
      const book = all('.book')[1];
      expect([book.style.left, book.style.top, book.style.width, book.style.height]).toEqual(['60px', '20px', '40px', '120px']);
      expect(all('.desk > .slip')[0].style.top).toBe('200px');
    });

    it('the book opens in the scene first, then on the page', async () => {
      await make(fakeScene, sample());
      const open = spyOn(model, 'openBook').and.callThrough();
      all('.book')[0].click();
      all('.book')[1].click();                              // a second click while it opens does nothing
      await settle();
      expect(sceneCalls.filter(c => c.startsWith('open'))).toEqual(['open:3']);
      expect(open).not.toHaveBeenCalled();
      expect(el().querySelector('.shelf')!.classList).toContain('leaving');
      opened();
      await settle();
      expect(open).toHaveBeenCalledOnceWith(folders[0], [11]);
    });

    it('hover and focus lift the book, the stack fans in the scene too', async () => {
      await make(fakeScene, sample());
      all('.book')[1].dispatchEvent(new Event('mouseenter'));
      all('.book')[1].dispatchEvent(new Event('mouseleave'));
      expect(sceneCalls).toContain('highlight:book:5');
      expect(sceneCalls[sceneCalls.length - 1]).toBe('highlight:null');
      all('.stack-top')[0].click();
      fixture.detectChanges();
      expect(sceneCalls).toContain('fan:true');
      expect(all('.aria-stack .slip')[0].style.left).toBe('300px');
    });

    it('coming back from a book, that book is shown closing', async () => {
      await make(fakeScene, sample(), 5);
      expect(sceneCalls[0]).toBe('start:5');
      expect(model.lastBookId).toBeNull();
    });

    it('a scene that cannot start leaves the flat shelf', async () => {
      spyOn(console, 'warn');
      await make(() => { throw new Error('no WebGL'); }, sample());
      expect(el().querySelector('.shelf')!.classList).toContain('flat');
      expect(all('.book').length).toBe(2);
    });

    it('lets go of the scene when it goes away', async () => {
      await make(fakeScene, sample());
      fixture.destroy();
      expect(sceneCalls).toContain('dispose');
    });
  });
});
