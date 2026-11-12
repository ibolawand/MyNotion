# MyNotion: bookshelf home screen

Date: 2026-11-12

## Goal

The home screen shows the folders as 3D books on a shelf. A click opens a book, and its notes are edited inside it.
This replaces the sidebar and the notes list as the way to move between notes. It keeps the dark/green look
(see `2026-11-10-dark-green-refinement-design.md`; a light redesign was rejected).

What the user said: "der home screen einfach die folders mit 3d buecher anzeigt, ich click auf einen, der oeffnet
sich und kann bearbeitet werden". Decisions made in the conversation:

1. Opening a book shows a **double page**: contents of the folder on the left, the note in the editor on the right.
2. Notes without a folder go on a **desk next to the shelf**: loose notes as slips, Aria's notes as a stack.
3. Inbox, Calendar, search, Aria and new note/book live in a **slim bar at the top**, in the shelf and in the book.
4. The 3D is **three.js** (the user chose it over CSS 3D for real lighting and a real opening animation). It draws
   only the shelf, the books and the desk. When a book has finished opening, the view hands over to the normal HTML
   double page: the editor never lives inside the 3D scene. Behind the canvas there is one invisible button per
   book, slip and stack, so keyboard, screen readers and the tests work without WebGL.

Success:
- Start screen = shelf with one book per folder, in the folder's colour, name on the spine, thickness by note count.
- Click a book, edit a note in it, Esc goes back. Nothing in the editor changed: autosave, formulas, images,
  highlights, Aria's edit proposals all work as before.
- Every existing way in still works: Ctrl+N / Ctrl+P / Ctrl+D, `open note 12` from Aria, `--open=` from the command
  line, Inbox, Calendar, the Aria panel.
- The database does not change. Aria writes to the same database, so no new table and no migration.
- Categories stay: a note's category shows as a small tag in the contents, and adding/deleting categories (today at
  the top of the notes list) moves into the open book's menu.

Not included: page turning, bookmarks, real lighting and shadows, shelf colours, sorting books by hand, folder
nesting on the desk.

## Structure

`home-app` shows the top bar plus exactly one of: shelf, open book (or open loose note), Calendar, Inbox. The Aria
panel opens to the right as now. `side-bar` and `overview-panel` stop being views. Their folder logic (create,
rename, colour, delete with confirmation and undo bar) is kept and moved to the new components. `text-editor` /
`editor` are not touched.

| Unit | Purpose | Depends on |
|---|---|---|
| `shelf-model.ts` (pure functions, no UI) | group notes by folder, book thickness, the desk (loose notes, Aria's stack), pinned-first order, sections for subfolders | `Note`, `Folder` |
| `top-bar` | Home, Inbox (unread badge), Calendar, search, Aria, New note, New book | `ModelService`, `MailService` |
| `bookshelf` | hosts the canvas and the invisible buttons, keyboard navigation, drop of a slip onto a book; falls back to flat coloured buttons when WebGL is missing | `shelf-model`, `shelf-scene`, `NoteService` |
| `shelf-scene.ts` | the three.js scene: books (spine texture with the name), desk, slips, light; hover turn-out; open animation; `still` mode for reduced motion | `three`, `Shelf` |
| `open-book` | double page: contents (left) + `editor` (right), rename / colour / delete of the book | `shelf-model`, `NoteService`, `Editor` |

`ModelService` gets one state: what the workspace shows (`shelf`, `book` + folder id, `slip` + note id, `calendar`,
`inbox`). `openHome()` goes to the shelf. `openTarget('note:12')` opens the book that holds note 12 and selects it,
or the slip on the desk when it has no folder. The existing `isExistingNoteOpen$` / `currentFolder$` keep working for
the editor and the Aria panel's "open note" context.

## The shelf

- One book per folder. Cover = folder colour (`FOLDERS.colour`), spine text = folder name, thickness grows with the
  number of notes (clamped, so one note is still a visible book and fifty is not a wall).
- Hover or keyboard focus turns the book out of the row and lifts it. Arrow keys move focus, Enter opens it.
  `prefers-reduced-motion`: no turning, no opening animation, only a highlight.
- More books than fit in a row make a second row.
- Colours come from the tokens in `styles.css`; book colours are the user's folder colours, and spine text colour is
  picked per book for AA contrast (dark or light text, whichever passes 4.5:1).

## The open book

- Click: the book moves forward and opens (about 0.5 s), the shelf fades. Back: Esc, the arrow in the top bar or
  "Home"; the book closes and stands in the shelf again.
- Left page = contents: pinned notes first, then by last change; subfolders as sections with indented notes;
  "+ New note" at the end creates the note in this book. The book has a rename field, a colour picker and delete (same
  confirmation and undo as now). The contents can be collapsed for narrow windows.
- Right page = the existing `editor` with the selected note. On opening, the most recently edited note is selected.
  An empty book shows "No note yet" and the new-note button.
- With the Aria panel open the book gets narrower.

## The desk

- Loose notes (`folderID = 0`, not Aria's) lie as slips with title and the first lines. A click opens the slip
  straight in the editor (no double page); Esc returns.
- Aria's notes ("Shopping list", "Inbox", "What Aria knows about me") are a stack; a click fans it out, then a click
  opens one like a slip. They are recognised by title in one list in `shelf-model.ts`, so adding one is a one-line
  change.
- Empty desk: only the stack, or nothing. New note from the top bar asks "In a book or on the desk?". Aria creates
  notes without a folder, so they appear as slips.
- A slip can be dragged onto a book and moves into that folder. This is the only drag and drop.

## Data and reload

- No schema change. Book = `FOLDERS` row, slip = `notes` row with `folderID = 0` (or a folder that no longer exists).
- Renaming and recolouring a folder does not exist yet (only add and delete): one new IPC call `updateFolder`
  (`note/src/requestHandler.ts`, `preload.ts`) and `NoteService.updateFolder`. It writes `name` and `colour` only.
- Aria writes to the database while MyNotion is open: `db-changed` → `NoteService.reloadFromDatabase()` already
  updates the lists. The shelf and contents must update from that without closing the open book, moving the selected
  note or touching unsaved text (`NoteService.unsaved` protects it; see `note-autosave.spec.ts`).
- If the open book's folder was deleted from outside, go back to the shelf with a short message; the note being
  edited is flushed first (`flushSaves`).

## Tests (Karma / Jasmine, `npx ng test --watch=false --browsers=ChromeHeadless`)

- `shelf-model`: notes grouped per folder, thickness clamped, loose vs Aria's notes, pinned first, subfolder sections.
- `bookshelf`: one book per folder; click opens; Esc closes; arrow keys + Enter; reduced motion; empty desk.
- `open-book`: contents list, selecting a note shows it in the editor, new note lands in this book, empty book hint,
  rename / colour use `updateFolder`, delete uses the existing service.
- Navigation: `note:12` opens its book with the note selected; a loose note opens as a slip; Ctrl+P and Ctrl+D
  jump into the right book.
- Reload: an external database change updates the shelf while a book is open and leaves the open note and unsaved
  text alone.
- Existing specs (`note-autosave`, `math-snippets`, `aria-panel`, …) keep passing.

Then once in the real app (`./build_app.sh`) with screenshots before anything is committed.

## Risks

- `home-app` and `model.service` are the hub of navigation (Aria's `--open=`, the Aria panel's note context, Ctrl
  shortcuts). Every entry point must be listed and tested; that is where regressions would appear.
- Spine text is drawn to a canvas texture: render it at device pixel ratio and check sharpness at 100 % and 125 %.
- three.js adds about 600 KB to the bundle and cannot be checked in the headless test browser: the scene's look is
  checked by eye in the real app; tests cover the logic, the buttons and the hand-over.
- A very long folder name on a spine: shortened with an ellipsis, the full name as a tooltip and in the book.
