# Dark/green refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MyNotion's 162 hard-coded colours with one token palette and refine the sidebar, editor, mail and calendar without changing the dark/green identity.

**Architecture:** Tokens and shared button/input/focus styles live in `note-frontend/src/styles.css` (`:root` + global classes). Component CSS files swap literals for `var(--token)`. A Node script, `note-frontend/scripts/check-theme.mjs`, is the test: it checks token contrast and reports hard-coded colours per file.

**Tech Stack:** Angular 20 (component CSS, `@angular/build`), Electron packaging via `build_app.sh`, Node ≥ 18 for the checker.

**Spec:** `docs/superpowers/specs/2026-11-10-dark-green-refinement-design.md`

## Global Constraints

- Keep the look: surfaces `#171a29` / `#1f2233` / `#262a3d` / `#2e3349`, accent `#4ade80` unchanged. No light theme, no new fonts, no layout changes, no changes in `note/` (Electron).
- Token names and values exactly as the spec's token table (`--bg-sunken`, `--bg`, `--bg-raised`, `--bg-overlay`, `--line`, `--line-strong`, `--hover`, `--text`, `--text-2`, `--text-3`, `--text-faint`, `--accent`, `--accent-fill`, `--on-accent`, `--accent-soft`, `--accent-line`, `--accent-strong`, `--danger`, `--warn`, `--info`, `--r-sm/md/lg/xl`, `--space-1…6`, `--sans`, `--serif`, `--mono`).
- `--text-faint` (`#6b7280`) never colours readable text; readable grey text uses `--text-3` or `--text-2`.
- Component style budget: `anyComponentStyle` errors at 8 kB minified (`angular.json`). `calendar.css` (7.9 kB) and `math.css` (7.9 kB) are at the limit today: `var(--x)` is longer than a hex literal, so remove duplicated rules / move shared looks to global classes in the same edit. `npx ng build` must not error.
- Keep existing class names that templates or TS reference (e.g. `.primary`, `.event-red`, `.folder-item`); change only their styles unless a task says otherwise.
- Commit messages: plain sentence, like the repo's history, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Styles inside `::ng-deep .tiptap-editor-content` (note body) — callout, highlight and toggle colours are content colours; they must look the same after the swap (allowlisted, not tokenised).
2. Native widgets: `input[type=date|time]`, `<select>`, scrollbars — must keep `color-scheme: dark` and not turn white.
3. Hover/active/selected states across sidebar rows, mail rows and calendar slots — must stay distinguishable from each other after the grey unification.
4. Calendar narrow (side-by-side) events and short events — the 3px bar and tinted background must still leave the title readable.
5. Component style budget overflow on `calendar.css` / `math.css` — the build fails, not just warns.

Each is checked in the owning task's verification step (named there).

---

### Task 1: Theme checker, tokens and shared controls

**Files:**
- Create: `note-frontend/scripts/check-theme.mjs`
- Modify: `note-frontend/src/styles.css` (`:root` block, lines ~20–48; add global controls)
- Modify: `note-frontend/src/app/text-editor/text-editor.css:14-16`, `note-frontend/src/app/editor/editor.css:6` (font tokens move to `:root`)

**Interfaces:**
- Produces: `node scripts/check-theme.mjs [--strict] [files…]` (run from `note-frontend/`).
  - Always: parses `:root` in `src/styles.css`, resolves token values, checks these pairs ≥ 4.5:1 and prints each ratio:
    `--text`, `--text-2`, `--text-3`, `--accent`, `--danger`, `--warn`, `--info` on each of `--bg-sunken`, `--bg`, `--bg-raised`; and `--on-accent` on `--accent-fill`. Exits 1 on a failing pair or a missing token.
  - With files: lists every hex (`#rgb`, `#rrggbb`, `#rrggbbaa`) and `rgb(a)/hsl(a)(…)` literal per file with line numbers, except: anything inside `:root {…}` of `styles.css`, `rgba(0, 0, 0, …)` (shadows), `transparent`/`currentColor`, and values in the `ALLOW` map (`file → [values]`, each entry with a one-line reason comment). With `--strict`, exits 1 if any are listed.
  - Initial `ALLOW`: `src/app/calendar/calendar.css → #ef4444 #3b82f6 #22c55e #a855f7` (event colours); `src/app/inbox/mail-reader.css → #fff` (mail paper); `src/app/inbox/*.css → #10131f` (avatar initials on generated hue). Later tasks may add content colours (highlight/callout) with a reason.
- Produces: global classes `.btn` (outlined) and `.btn.primary` / `button.primary` (filled green), shared input look via `.field-input` and `input.input`, and one `:focus-visible` outline `2px solid var(--accent)` with `outline-offset: 2px`.

- [ ] **Step 1: Write the checker** (`scripts/check-theme.mjs`, ES module, no dependencies; WCAG relative luminance as in the spec's audit; rgba tokens are composited over `--bg` before measuring).
- [ ] **Step 2: Run it to see it fail**
  Run: `cd note-frontend && node scripts/check-theme.mjs`
  Expected: exit 1, "missing token --bg-sunken" (the current `:root` has only the old purple tokens).
- [ ] **Step 3: Replace the `:root` block in `styles.css`** with the spec's tokens (delete every old token; none is used — verified by grep). Move `--sans`, `--serif`, `--mono` from `text-editor.css`/`editor.css` into `:root` and delete them there. Set `body { background: var(--bg-sunken); color: var(--text); font-family: var(--sans); color-scheme: dark; }`. Add the shared controls above. Swap the `.due-task` block's literals to tokens (`#f87171`→`--danger`, `#4ade80`→`--accent`, `#cbd5e1`→`--text-2`, `#6b7280` border→`--text-faint`).
- [ ] **Step 4: Run the checker**
  Run: `node scripts/check-theme.mjs --strict src/styles.css`
  Expected: all pairs ≥ 4.5 printed (lowest: `--text-3` on `--bg-raised` 4.59), no literals, exit 0.
- [ ] **Step 5: Build** — `npx ng build` succeeds; the app's fonts are unchanged (editor still serif).
- [ ] **Step 6: Commit** — `git add note-frontend/scripts note-frontend/src/styles.css note-frontend/src/app/text-editor/text-editor.css note-frontend/src/app/editor/editor.css` — "Theme tokens, shared buttons and inputs, and a contrast/literal checker".

### Task 2: Sidebar

**Files:**
- Modify: `note-frontend/src/app/side-bar/side-bar.css` (whole file), `note-frontend/src/app/side-bar/side-bar.html` only if a button needs the `primary` class

**Interfaces:**
- Consumes: Task 1 tokens and `.primary`.

- [ ] **Step 1: See it fail** — `node scripts/check-theme.mjs --strict src/app/side-bar/side-bar.css` lists the cloth tokens' literals and others; exit 1.
- [ ] **Step 2: Rewrite `side-bar.css` as one rule set.** Delete the cloth `:root` block (lines 1–75: `--cloth*`, `--page`, `--rule`, `--ink`, `--marker`, `--font-ui`, `--font-write`) and merge each duplicated selector (`.sidebar`, `.folder-item`, `.folder-item::before`, `.folder-item:hover`, `.folder-item.active`, `.new-note-btn`, `.menu-item.active`) into a single rule. Values: sidebar `--bg`, right border `--line`; section titles `--text-3`, 13px/600; rows hover `--hover`, active `--bg-raised` + `--text`; folder spine `background: var(--spine, var(--accent))` (folders with their own colour keep it); New-note button = filled green (`--accent-fill`/`--on-accent`, no gradient); logo icon solid `--accent-fill`; search box uses the shared input look. Row padding on the `--space-*` scale.
- [ ] **Step 3: Run the checker** — same command, exit 0.
- [ ] **Step 4: Build** — `npx ng build` passes with no budget error. (Review Focus 3: hover vs. active vs. a folder's own spine colour stay distinct — verify in the Task 7 screenshot.)
- [ ] **Step 5: Commit** — "Sidebar: one rule set on the theme tokens; New note and default folder spine are green".

### Task 3: Notes editor

**Files:**
- Modify: `note-frontend/src/app/editor/editor.css`, `note-frontend/src/app/text-editor/{text-editor,page-tools,tables,blocks,note-content,math}.css`, `note-frontend/src/app/text-editor/aria-edit/aria-edit.css`
- Modify: `note-frontend/scripts/check-theme.mjs` (`ALLOW` for content colours only)

- [ ] **Step 1: See it fail** — `node scripts/check-theme.mjs --strict src/app/editor/*.css src/app/text-editor/*.css src/app/text-editor/aria-edit/*.css`; exit 1.
- [ ] **Step 2: Swap literals to tokens.** Toolbar, page tools, table chrome (handles, add/remove bar), formula/matrix boxes, Aria edit card: surfaces `--bg-raised`/`--bg-overlay`, borders `--line`/`--line-strong`, radii `--r-*`, readable grey → `--text-2`/`--text-3`, green states → `--accent*`. Note body: text colour `--text`; heading spacing made consistent only if it differs between h1–h3 for no reason. Callout kinds (note/tip/important/warning) and the four highlight-marker colours stay literal and go into `ALLOW` with the reason "content colour". `math.css` must stay under the 8 kB budget (Global Constraints).
- [ ] **Step 3: Run the checker** — exit 0.
- [ ] **Step 4: Run the editor tests and build**
  Run: `npx ng test --watch=false --browsers=ChromeHeadless` (set `CHROME_BIN=/usr/bin/google-chrome` if Karma can't find Chrome) and `npx ng build`
  Expected: all 10 spec files pass; build without budget errors.
- [ ] **Step 5: Commit** — "Editor on the theme tokens; note content colours unchanged".

### Task 4: Mail

**Files:**
- Modify: `note-frontend/src/app/inbox/{inbox,mail-reader,compose,mail-setup}.css`

- [ ] **Step 1: See it fail** — checker `--strict` on `src/app/inbox/*.css`; exit 1.
- [ ] **Step 2: Swap and refine.** List `--bg` with sunken search input; `.when` and `.preview` → `--text-3`; `.from`/`.subject` `--text-2`, unread rows `--text` + 600 weight and the green dot (no other colour change); tabs: active `--accent-soft` bg, `--accent-line` border, `--accent` text; `button.primary` uses the global filled green (remove the gradient); reader action buttons use the shared outlined look; `.banner.error` `--danger` text on `--danger` at ~15% alpha (`color-mix(in srgb, var(--danger) 15%, transparent)`), offline `.banner` uses `--info` the same way; `.notice` accent-soft; placeholder icon stroke `--line-strong`. `.event-form input` keeps `color-scheme: dark` (Review Focus 2).
- [ ] **Step 3: Run the checker** — exit 0 (avatar `#10131f` and paper `#fff` allowlisted).
- [ ] **Step 4: Build** — `npx ng build` passes.
- [ ] **Step 5: Commit** — "Mail on the theme tokens: readable times and previews, one primary button style".

### Task 5: Calendar

**Files:**
- Modify: `note-frontend/src/app/calendar/calendar.css`, `note-frontend/src/app/event-adder/event-adder.css`

- [ ] **Step 1: See it fail** — checker `--strict` on both files; exit 1.
- [ ] **Step 2: Events.** Replace lines 314–317 with tinted events. For each of red/blue/green/purple set one custom property, e.g. `.event-red { --ev: #ef4444; }`, and style `.event, .all-day-event` once: `background: color-mix(in srgb, var(--ev) 18%, var(--bg)); border-left: 3px solid var(--ev); color: var(--text);`, time text `--text-2`. Narrow events keep the 3px bar and `padding-left` ≥ 6px (Review Focus 4).
- [ ] **Step 3: Today and grid.** Today's day number `--accent` (filled pill keeps `--on-accent` on `--accent-fill` if it is a pill), current-time line and dot `--accent`, today column `color-mix(in srgb, var(--accent) 4%, transparent)`, hour lines `--line`, slot hover `--hover`. Modal: `--bg-overlay`, `--r-lg`; `.field-input` uses the global input look (delete the local copy — this is also how the file stays under budget).
- [ ] **Step 4: Run the checker and build**
  Run: `node scripts/check-theme.mjs --strict src/app/calendar/calendar.css src/app/event-adder/event-adder.css && npx ng build`
  Expected: exit 0; no `anyComponentStyle` error for `calendar.css` (Review Focus 5).
- [ ] **Step 5: Commit** — "Calendar: tinted events with a colour bar and readable text; today in green".

### Task 6: Remaining screens (token swap only)

**Files:**
- Modify: every other `note-frontend/src/app/**/*.css`: `app.css`, `home-app`, `starting-page`, `overview-panel`, `quick-search`, `aria-panel`, `login-app`, `creat-account`, `folder-adder`, `study-scene`, `radio`, `window-bar`, `undo-bar` (if it has CSS)

- [ ] **Step 1: See it fail** — `node scripts/check-theme.mjs --strict $(find src/app -name '*.css')`; exit 1 listing these files.
- [ ] **Step 2: Swap literals to the nearest token; no layout changes.** Study scene/radio artwork colours that are illustration, not UI, go into `ALLOW` with a reason.
- [ ] **Step 3: Run the checker on all files** — same command, exit 0.
- [ ] **Step 4: Build** — `npx ng build` passes.
- [ ] **Step 5: Commit** — "Remaining screens on the theme tokens".

### Task 7: Verify in the real app

- [ ] **Step 1: Full checks** — `node scripts/check-theme.mjs --strict $(find src/app -name '*.css') src/styles.css`, `npx ng test --watch=false --browsers=ChromeHeadless`, `npx ng build`: all pass. Paste the contrast table into the hand-off.
- [ ] **Step 2: Package** — `./build_app.sh` from the repo root; ends with "✓ Done".
- [ ] **Step 3: Ask the user to restart MyNotion** (it is running from `note/out/MyNotion-linux-x64/MyNotion`; do not kill it yourself) and to look at sidebar+editor, mail and calendar. Check Review Focus 1–4 together: a note with a callout, a highlight and a toggle; a date input; hover vs. selected rows; two overlapping calendar events.
- [ ] **Step 4: Fix or revert per screen** on the user's feedback; each fix is its own commit.
