# Bookshelf Home Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MyNotion's home screen shows the folders as 3D books on a shelf; a click opens a book as a double page (contents left, editor right); notes without a folder lie on a desk.

**Architecture:** One pure file (`shelf-model.ts`) turns notes + folders into books, desk slips and Aria's stack. `ModelService` gets one derived `workspace$` (shelf / book / slip / calendar / inbox) computed from its existing subjects plus one new `openBookId`, so every existing entry point (`onNoteClicked`, `openHome`, `showCalendar`, `showInbox`) keeps working and lands in the right view. Three new components (`bookshelf` with `book-3d`, `open-book`, `top-bar`) replace `side-bar` and `overview-panel` in `home-app`. The editor is not touched.

**Tech Stack:** Angular (standalone components, `@if`/`@for` control flow, rxjs), three.js for the shelf, Electron IPC + SQLite for one new call, Karma/Jasmine.

**Spec:** `docs/superpowers/specs/2026-11-12-bookshelf-home-design.md`

## Global Constraints

- All paths are relative to `/home/lala/Desktop/school/personal/MyNotion`. Frontend code is in `note-frontend/src/app`.
- Do NOT edit `text-editor/*` or `editor/*`. Do NOT change the database schema.
- One new npm dependency: `three` (+ `@types/three` as dev dependency). It draws the shelf only; the editor stays HTML.
- Colours, radii and fonts come from the tokens in `note-frontend/src/styles.css` (`--bg-sunken`, `--bg`, `--bg-raised`, `--line`, `--text`, `--text-2`, green accent). Dark/green stays; no light theme.
- `prefers-reduced-motion: reduce` → no rotation, no open/close animation, only a highlight.
- Tests: `cd note-frontend && npx ng test --watch=false --browsers=ChromeHeadless`. All existing specs keep passing.
- Work on branch `bookshelf-home` (from `dark-green-refinement`). Commit locally after each task; never push (the user pushes on request). Commit messages in the repo's style ("Bookshelf: …"), ending with the session's `Co-Authored-By` line.
- UI text is English, like the rest of the app.

## Review Focus

1. A note whose `folderID` points to a folder that no longer exists → it must appear on the desk, not vanish (test in Task 1).
2. A folder with `colour` null, empty or not a hex colour → book in `#4ade80`, readable spine text (Task 1).
3. A very long folder name, and 30+ folders → ellipsis on the spine with the full name as `title`; books wrap into more rows without horizontal scrolling (Task 4).
4. The open book's folder is deleted from outside (Aria, another window) while a note is being typed → `flushSaves()` first, then back to the shelf; no exception (Task 5).
5. A new, not yet saved note (`id` undefined) is open when the database reloads → it stays open with its text (Task 6).

---

### Task 1: The shelf model (pure logic)

**Files:**
- Create: `note-frontend/src/app/shelf/shelf-model.ts`
- Test: `note-frontend/src/app/shelf/shelf-model.spec.ts`

**Interfaces:**
- Consumes: `Note`, `Folder` from `note-frontend/src/model/models.ts`.
- Produces:
  ```ts
  export const ARIA_NOTES = ['Shopping list', 'Inbox', 'What Aria knows about me'];   // matched case-insensitively
  export const DEFAULT_COLOUR = '#4ade80';
  export interface Book { folder: Folder; colour: string; ink: '#11131c' | '#ffffff'; count: number; spine: number; }
  export interface Section { folder: Folder; depth: number; notes: Note[]; }   // depth 0 = the book itself
  export interface Shelf { books: Book[]; slips: Note[]; aria: Note[]; }
  export function buildShelf(notes: Note[], folders: Folder[]): Shelf;
  export function bookIdOf(folderId: number | undefined, folders: Folder[]): number | null;   // top-level ancestor; null = desk
  export function contentsOf(bookId: number, notes: Note[], folders: Folder[]): Section[];
  export function latestNote(sections: Section[]): Note | null;
  export function spineWidth(count: number): number;        // clamp(28 + 6 * count, 34, 88) px
  export function inkFor(colour: string): '#11131c' | '#ffffff';   // the one with the higher WCAG contrast
  export function edited(note: Note, long?: boolean): string;      // moved unchanged from overview-panel.ts
  ```

- [ ] **Step 1: Write the failing tests** in `shelf-model.spec.ts` (`describe('shelf model')`), with folders `Math(3, #4ade80)`, `German(5, #ef4444)`, `Sub(11, parent 3)` and notes in 3, 11, 5, 0 and 99 (missing folder):
  - `buildShelf`: `books` are the top-level folders only, in folder order; Math's `count` includes the note in `Sub`; a note titled `shopping list` (any case) with `folderID 0` is in `aria`, not `slips`; notes with `folderID` 0 and 99 are in `slips`; an Aria-titled note inside a folder stays in its book.
  - `spineWidth(0) === 34`, `spineWidth(3) === 46`, `spineWidth(50) === 88`.
  - `inkFor('#4ade80') === '#11131c'`, `inkFor('#1f2233') === '#ffffff'`; `buildShelf` gives `colour === '#4ade80'` for `colour` `null`, `''` and `'banana'`.
  - `bookIdOf(11, folders) === 3`, `bookIdOf(0, folders) === null`, `bookIdOf(99, folders) === null`.
  - `contentsOf(3, …)`: first section is Math at depth 0, then Sub at depth 1; inside a section pinned notes first, then newest `updated_at` first.
  - `latestNote` returns the note with the newest `updated_at` across sections; `null` for an empty book.
- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include='**/shelf-model.spec.ts'` → FAIL (module not found).
- [ ] **Step 3: Implement** the functions above. `edited()` is cut from `overview-panel/overview-panel.ts` (lines with `edited(note: Note, long = false)`) and exported unchanged.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `Bookshelf: notes and folders as books, desk slips and Aria's stack`.

### Task 2: Workspace state in ModelService

**Files:**
- Modify: `note-frontend/src/app/model.service.ts`
- Test: `note-frontend/src/app/model.service.spec.ts` (new)

**Interfaces:**
- Produces:
  ```ts
  export type Workspace = { view: 'shelf' } | { view: 'book'; folderId: number } | { view: 'slip' }
                        | { view: 'calendar' } | { view: 'inbox' };
  // on ModelService:
  openBookId$: Observable<number | null>;
  workspace$: Observable<Workspace>;      // derived, distinctUntilChanged on view + folderId
  openBook(folder: Folder, descendantIds: number[]): void;   // setCurrentFolder(folder, descendantIds) + openBookId
  closeBook(): void;                                          // back to the shelf: openHome()
  ```
- Rule for `workspace$`, in this order: inbox open → `inbox`; a note open (`isExistingNoteOpen`) → `book` with `openBookId` if set, else `slip`; calendar open → `calendar`; `openBookId` set → `book`; else `shelf`.
- `onNoteClicked(note)` keeps its behaviour and does not change `openBookId` (the caller decides the book: see Task 6 `openNote`). `openHome()`, `showCalendar()`, `toggleCalendar()` and `showInbox()` set `openBookId` to `null`. `openHome()` also calls `setCurrentFolder(null, [])`.

- [ ] **Step 1: Write the failing tests**: starts as `shelf`; `openBook(math, [11])` → `{view:'book', folderId:3}` and `getCurrentFolder() === math`; then `onNoteClicked(note)` → still `book` 3; `onNoteClicked(loose)` with no book open → `slip`; `showCalendar()` from an open book → `calendar`, then `openHome()` → `shelf`; `showInbox()` → `inbox`; `closeBook()` → `shelf` and `isExistingNoteOpen` false; `toggleOpenNewNote()` inside book 3 opens a note with `folderID 3`.
- [ ] **Step 2: Run** with `--include='**/model.service.spec.ts'` → FAIL.
- [ ] **Step 3: Implement** with `combineLatest` of the existing subjects and a new `private openBookSubject = new BehaviorSubject<number | null>(null)`.
- [ ] **Step 4: Run** → PASS, and the full suite still passes.
- [ ] **Step 5: Commit** `Bookshelf: one workspace state (shelf, book, slip, calendar, inbox)`.

### Task 3: Rename and recolour a folder

**Files:**
- Modify: `note/src/requestHandler.ts` (next to `ipcMain.handle('addFolder'…`, ~line 324), `note/src/preload.ts` (~line 65), `note-frontend/src/services/NoteService.ts` (next to `addFolder`, ~line 456)
- Test: `note-frontend/src/services/note-folders.spec.ts` (new)

**Interfaces:**
- Produces: IPC `updateFolder(folder: { id: number; name: string; colour: string })` → runs `UPDATE FOLDERS SET name = ?, colour = ? WHERE id = ? AND userID = ?`, returns the updated row. `NoteService.updateFolder(folder: Folder): Promise<Folder>` calls it, then `notifyFolderChanged()`. A name that is empty after `trim()` is rejected without a database call (returns the folder unchanged).

- [ ] **Step 1: Write the failing test** (fake `window.electronAPI` as in `note-autosave.spec.ts`): `updateFolder({…math, name: ' Maths ', colour: '#ef4444'})` calls the API once with `name: 'Maths'`, and `folderChanged$` emits; `name: '  '` makes no API call.
- [ ] **Step 2: Run** with `--include='**/note-folders.spec.ts'` → FAIL.
- [ ] **Step 3: Implement** the handler, the preload entry and the service method.
- [ ] **Step 4: Run** → PASS; `cd note && npx tsc --noEmit -p .` → no errors.
- [ ] **Step 5: Commit** `Folders can be renamed and recoloured`.

### Task 4: The shelf, the books and the desk

**Files:**
- Create: `note-frontend/src/app/bookshelf/book-3d.ts` (+ `.html`, `.css`), `note-frontend/src/app/bookshelf/bookshelf.ts` (+ `.html`, `.css`)
- Test: `note-frontend/src/app/bookshelf/bookshelf.spec.ts`

**Interfaces:**
- Consumes: `buildShelf`, `Book`, `edited` (Task 1); `ModelService.openBook` (Task 2); `NoteService.notes$`, `loadFolders()`, `folderChanged$`, `updateNote()`.
- Produces:
  - `Book3d` — selector `app-book-3d`, inputs `book: Book`, `focused: boolean`; output `opened: EventEmitter<void>`. Root element is a `<button class="book">` with `aria-label="Open {name}, {count} notes"`, `title` = full name, CSS variables `--cover`, `--ink`, `--spine` (px). Faces: `.spine`, `.cover`, `.pages`.
  - `Bookshelf` — selector `app-bookshelf`. Emits nothing; it calls `modelService.openBook(folder, descendantIds)` for a book and `modelService.onNoteClicked(note)` for a slip or an Aria note. Markup hooks used by tests: `.book`, `.slip`, `.aria-stack`, `.aria-stack.fanned .slip`, `.desk`, `.shelf-row`.
- CSS decisions: `.shelf { perspective: 1400px }`; a book at rest shows its spine (`rotateY(-90deg)` cover hidden), hover/focus `rotateY(-32deg) translateZ(18px)` in 220 ms; opening adds class `.opening` (480 ms: `translateZ(160px) rotateY(0)`, cover `rotateY(-160deg)`), and `openBook` is called on `animationend` (immediately under reduced motion). Rows wrap with `flex-wrap`; no horizontal scrolling. Spine text is vertical (`writing-mode: vertical-rl`), `text-overflow: ellipsis`.
- Slip: title + first 90 characters of the note's plain text. Draggable (`draggable="true"`, `dataTransfer` type `application/x-mynotion-note` with the note id); a book is a drop target and on drop calls `noteService.updateNote({...note, folderID: book.folder.id})`.

- [ ] **Step 1: Write the failing tests** (`TestBed`, fake `NoteService` with `BehaviorSubject` notes and `loadFolders`):
  - one `.book` per top-level folder, each with the folder name and `--cover` equal to its colour;
  - click on the Math book → `openBook` called with the Math folder and `[11]`;
  - `ArrowRight` moves focus to the next book, `ArrowLeft` back, `Enter` opens the focused one;
  - loose notes render as `.slip` with title; clicking one calls `onNoteClicked` with it;
  - Aria's notes are not slips; clicking `.aria-stack` adds `.fanned` and shows them; with no Aria notes there is no `.aria-stack`; with no loose and no Aria notes `.desk` is empty;
  - dropping a slip on a book calls `updateNote` with that book's `folderID`;
  - a folder named with 80 characters keeps the full name in `title`; 30 folders render 30 books and the shelf's `scrollWidth <= clientWidth`;
  - `notes$` emitting a new list updates the books without recreating the component.
- [ ] **Step 2: Run** with `--include='**/bookshelf.spec.ts'` → FAIL.
- [ ] **Step 3: Implement** `Book3d`, then `Bookshelf`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Bookshelf: folders as 3D books, loose notes on the desk`.

### Task 5: The open book

**Files:**
- Create: `note-frontend/src/app/open-book/open-book.ts` (+ `.html`, `.css`)
- Test: `note-frontend/src/app/open-book/open-book.spec.ts`

**Interfaces:**
- Consumes: `contentsOf`, `latestNote`, `Section`, `edited` (Task 1); `ModelService.openBookId$`, `closeBook()`, `onNoteClicked()`, `toggleOpenNewNote()`, `openFolderAdder(parentID)`, `currentNote$` (Task 2); `NoteService.updateFolder` (Task 3), `deleteFolder`, `deleteWithUndo`, `setPinned`, `flushSaves`, `categories$`, `addCategory`, `deleteCategory`; the existing `Editor` (`<app-editor>`) and `FolderAdder`.
- Produces: `OpenBook` — selector `app-open-book`, no inputs (it reads `openBookId$`). Markup hooks: `.contents`, `.contents.collapsed`, `.section-title`, `.contents-note`, `.contents-note.active`, `.category-tag`, `.new-note`, `.book-title` (input), `.book-colour` (input type color), `.book-delete`, `.book-menu`, `.empty-book`, `.page-right`.
- Behaviour decided here:
  - On opening a book with no note open, select `latestNote(sections)` via `onNoteClicked`. Empty book → `.empty-book` with text `No note yet` and the new-note button; no editor.
  - `.new-note` calls `toggleOpenNewNote()` (the book is the current folder, so the note gets its `folderID`).
  - `.book-title` saves on blur/Enter through `updateFolder`; `.book-colour` on `change`.
  - `.book-delete` asks with `confirm('Delete "<name>" and its notes?')`, then `flushSaves()`, `deleteFolder`, `closeBook()`.
  - Delete of a note in the contents: `deleteWithUndo(note)`; if it was the open note, select `latestNote` of what remains.
  - `.book-menu` holds "Add section" (`openFolderAdder(bookId)`), and the categories list with add/delete (logic moved from `overview-panel.ts`: `addCategory`, `deleteCategory`).
  - If the book's folder is missing after a folder reload: `await flushSaves()`, then `closeBook()`.
  - `Escape` (document keydown, not while a modal, the quick search or a formula box has focus: skip when `event.defaultPrevented` or the target is inside `.modal-backdrop, .quick-search, .math-popover`) → `flushSaves()` then `closeBook()`.

- [ ] **Step 1: Write the failing tests**:
  - contents list sections "Math" then "Sub" with their notes, pinned first; a note with `categoryID 1` shows `.category-tag` "ExamPrepreation";
  - opening selects the newest note (`onNoteClicked` called with it); clicking another `.contents-note` selects that one and marks it `.active`;
  - empty book shows `No note yet` and no `app-editor`;
  - `.new-note` → `toggleOpenNewNote` called;
  - typing a new title and blurring calls `updateFolder` with the new name; an empty title does not;
  - changing `.book-colour` calls `updateFolder` with the colour;
  - delete with `confirm` → true calls `flushSaves`, then `deleteFolder`, then `closeBook`, in that order; with false nothing;
  - folders reloaded without this book → `flushSaves` then `closeBook`, no error thrown;
  - `Escape` → `closeBook`; `Escape` with `defaultPrevented` → not called;
  - toggling the contents adds `.collapsed`.
- [ ] **Step 2: Run** with `--include='**/open-book.spec.ts'` → FAIL.
- [ ] **Step 3: Implement** `OpenBook`. Layout: `.open-book { display: grid; grid-template-columns: minmax(220px, 300px) 1fr }`, a 1px fold line (`--line-strong`) between the pages, a 6px stacked-pages edge on the left; nothing decorative over the editor.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Bookshelf: an opened book shows its contents and the note`.

### Task 6: Top bar and wiring into the home screen

**Files:**
- Create: `note-frontend/src/app/top-bar/top-bar.ts` (+ `.html`, `.css`)
- Modify: `note-frontend/src/app/home-app/home-app.html`, `home-app.ts`, `home-app.css`; `note-frontend/src/app/quick-search/quick-search.ts` (only the calls that open a note)
- Delete: `note-frontend/src/app/side-bar/*`, `note-frontend/src/app/overview-panel/*`
- Test: `note-frontend/src/app/top-bar/top-bar.spec.ts`, `note-frontend/src/app/home-app/home-app.spec.ts` (new)

**Interfaces:**
- Consumes: `workspace$`, `openBook`, `closeBook` (Task 2); `bookIdOf` (Task 1); `Bookshelf`, `OpenBook`.
- Produces:
  - `ModelService.openNote(note: Note, folders: Folder[]): void` — the one way to open an existing note from anywhere: `bookIdOf(note.folderID, folders)`; if a book, `openBook(thatFolder, descendants)` then `onNoteClicked(note)`; else `openHome()` then `onNoteClicked(note)` (a slip). Used by `home-app.openTarget('note:…')`, quick search results, "Today's note" and the Aria panel's open-note links (replace their `openHome(); onNoteClicked(note)` pairs).
  - `TopBar` — selector `app-top-bar`. Buttons with hooks `.tb-back` (only in `book`/`slip`), `.tb-home`, `.tb-inbox` (+ `.menu-badge` with `mail.status$.unread`), `.tb-calendar`, `.tb-search` (opens the quick search: dispatch the same action Ctrl+P does), `.tb-aria`, `.tb-new-note`, `.tb-new-book` (`openFolderAdder(null)`), and hosts `<app-folder-adder>`.
  - `.tb-new-note`: inside a book → `toggleOpenNewNote()`. On the shelf → popover `.new-note-where` listing `On the desk` and each book; the choice opens the new note there. Ctrl+N follows the same rule.
- `home-app.html` after the change: `<app-window-bar>`, login, then inside the dashboard: `<app-quick-search>`, `<app-undo-bar>`, `<app-top-bar>`, and `@switch ((modelService.workspace$ | async)?.view)` → `shelf`: `<app-bookshelf>`; `book`: `<app-open-book>`; `slip`: `<app-editor>`; `calendar`: `<app-calendar>`; `inbox`: `<app-inbox>`; then the Aria panel as now. The "Pick a note, or start a new one" block is removed.

- [ ] **Step 1: Write the failing tests**:
  - `top-bar.spec.ts`: each button calls its `ModelService` method; `.tb-back` is absent on the shelf and present in a book; unread 3 shows the badge "3"; on the shelf `.tb-new-note` opens `.new-note-where` and choosing "Math" opens a new note with `folderID 3`, choosing "On the desk" one with `folderID 0`.
  - `home-app.spec.ts` (fake `electronAPI`, fake `NoteService`): starts on `app-bookshelf`; `openTarget('note:13')` (note in Math) shows `app-open-book` with book 3 and `currentNote$` = note 13; `openTarget('note:5')` (loose) shows `app-editor` without `app-open-book`; `openTarget('calendar')` shows `app-calendar`; `openTarget('inbox')` shows `app-inbox`; `Home` returns to the shelf.
  - reload: with book 3 and note 13 open, `notes$` emits a list where another note changed → still `app-open-book`, `currentNote$` still note 13; with a new unsaved note (`id` undefined) open on the desk, `notes$` emitting leaves it open with its text.
  - `model.service.spec.ts`: `openNote` for a note in `Sub(11)` opens book 3; for a note with `folderID 99` opens a slip.
- [ ] **Step 2: Run** the three spec files → FAIL.
- [ ] **Step 3: Implement** `openNote`, `TopBar`, the `home-app` template, and switch the callers. Delete `side-bar` and `overview-panel` and their imports.
- [ ] **Step 4: Run the full suite** `npx ng test --watch=false --browsers=ChromeHeadless` → all PASS; `npx ng build` → no errors.
- [ ] **Step 5: Commit** `Bookshelf: the shelf is the home screen, with a bar on top`.

### Task 7: The real app

**Files:**
- Modify: `/home/lala/Desktop/school/personal/personal-ai/BetterAI/FEATURES.md` (section "MyNotion app")

- [ ] **Step 1:** `./build_app.sh` in the repo root, start MyNotion.
- [ ] **Step 2: Check by hand and take screenshots** (shelf; a book opening; the open book; the desk with Aria's stack; a slip): every folder is a book in its colour; spine text is sharp at 100 % and 125 % scaling; open/close with click and Esc; edit a note, go back, reopen → text is there; Ctrl+N, Ctrl+P, Ctrl+D, Ctrl+J; Inbox and Calendar from the bar; with Aria running, "open the note Differentialgleichung" opens the Math book on that note, and a note Aria adds appears on the desk without closing an open book; narrow the window to 900 px → contents can be collapsed.
- [ ] **Step 3:** Fix what the check finds (each fix with a test in the owning task's spec file), rerun the full suite.
- [ ] **Step 4:** Update `FEATURES.md`: the shelf, the open book, the desk, the top bar, with the file names.
- [ ] **Step 5: Commit** in MyNotion `Bookshelf: fixes from the first real run` (if any) and show the screenshots to the user. Do not push.
