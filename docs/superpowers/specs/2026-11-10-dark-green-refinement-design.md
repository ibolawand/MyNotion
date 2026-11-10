# MyNotion: dark/green refinement

Date: 2026-11-10

## Goal

Keep MyNotion's look (dark `#1f2233` panels, green `#4ade80` accent) but make it consistent and readable.
This is a refinement, not a redesign: no new layouts, no light theme, no new fonts. A full light redesign
was reverted on 2026-11-07.

What the user said: refine dark/green; real design effort on the notes editor + sidebar, mail and calendar;
the yellow New-note button and default folder spine turn green.

Success:
- Every colour, radius and font in the app comes from tokens in `note-frontend/src/styles.css`.
- All text/background pairs in the palette reach WCAG AA (4.5:1); calendar event text too.
- The app still looks like MyNotion at a glance.

## Audit (before)

- 162 distinct colour values, nearly all hard-coded; `#4ade80` written 74 times with ~10 different alphas.
- `:root` in `styles.css` holds unused purple/pink tokens (`--primary-color: #667eea` …).
- `#6b7280` is used 41 times for readable text: 2.9–3.6:1, fails AA.
- 10 border radii (2–16px) and 7 different font declarations.
- `side-bar/side-bar.css` styles `.sidebar`, `.folder-item`, `.menu-item`, `.new-note-btn` twice: a leftover
  "cloth" block (navy `#22304F`, yellow `#F2C14E`, its own fonts) partly overridden by the dark rules below it.
- Calendar events are solid colour blocks with white text: 2.3:1 (green) to 4.0:1, all below AA.

## Tokens (`styles.css` `:root`, replacing the unused ones)

| Token | Value | Use |
|---|---|---|
| `--bg-sunken` | `#171a29` | app background, inputs, editor backdrop (~60%) |
| `--bg` | `#1f2233` | panels: sidebar, mail list, calendar grid (~30%) |
| `--bg-raised` | `#262a3d` | cards, popovers, Aria card |
| `--bg-overlay` | `#2e3349` | menus, modals |
| `--line` / `--line-strong` | `rgba(255,255,255,.07)` / `.14` | borders, dividers |
| `--hover` | `rgba(255,255,255,.05)` | row/button hover |
| `--text` | `#e4e7eb` | body (11.4–13.9:1) |
| `--text-2` | `#9ca3af` | labels, metadata (5.6–6.8:1) |
| `--text-3` | `#8b93a3` | hints, timestamps, previews (4.6–5.6:1) |
| `--text-faint` | `#6b7280` | placeholders, disabled, decoration only — never readable text |
| `--accent` | `#4ade80` | selection, today, active, focus (8.1–9.9:1) |
| `--accent-fill` / `--on-accent` | `#22c55e` / `#052e16` | primary buttons (6.5:1) |
| `--accent-soft` / `--accent-line` / `--accent-strong` | green at `.12` / `.35` / `.5` alpha | tinted backgrounds, outlines, focus borders |
| `--danger` / `--warn` / `--info` | `#f87171` / `#fbbf24` / `#60a5fa` | errors+overdue / warnings / info (≥5.1:1) |
| `--r-sm` `--r-md` `--r-lg` `--r-xl` | 4 / 6 / 10 / 16px | radii |
| `--space-1…6` | 4 / 8 / 12 / 16 / 24 / 32px | spacing |
| `--sans`, `--serif`, `--mono` | existing stacks | one UI font declaration; note serif and code mono unchanged |

Hard-coded values in every component CSS file are replaced with these tokens. Values that only exist once and
are genuinely specific (e.g. highlight-marker colours, the white mail "paper") stay literal.

## Shared components (global in `styles.css`)

- Buttons: `.btn` (outlined, `--line`, hover `--accent-line`), `.btn.primary` (`--accent-fill`, `--on-accent`,
  no gradient). Existing per-component button rules are reduced to these looks; class names stay where
  templates depend on them.
- Inputs: `--bg-sunken`, `--line`, focus border `--accent-strong`.
- Focus ring: one `:focus-visible` outline in `--accent`.

## Screens

**Sidebar** — merge the two rule sets into one on the dark tokens; delete the cloth tokens and their fonts.
New-note button becomes `.primary` green; default folder spine becomes `--accent` (folders with their own
colour keep it). Section titles `--text-3`; active row `--bg-raised` + `--text`; even row spacing.

**Editor** — toolbar, page tools, tables, callouts, toggles and formula/matrix boxes move to the surface,
line and radius tokens. Note body text unchanged except fixing inconsistent heading spacing if found.

**Mail** — layout unchanged. Time and preview `--text-3`; unread = bold + green dot only. Reader actions use
the shared button looks; New email loses its gradient. Error banner `--danger`, offline banner `--info` tint.

**Calendar** — events become: background = event colour at ~18% alpha, 3px solid left bar in the event colour,
text `--text`. Keep the four colours (red/blue/green/purple). Today: green day number, green current-time
line, `--accent-soft` column tint at low strength; hour lines `--line`. Event modal and fields use
`--bg-overlay` and shared inputs.

**Other screens** (home, overview, quick search, Aria panel, login, inbox setup/compose, study scene) — token
swap only, no layout changes.

## Out of scope

Light theme, new fonts, layout changes, new features, Electron side (`note/`).

## Verification

- `ng build` succeeds; existing frontend tests pass.
- A small script recomputes contrast for each text/background token pair (all ≥ 4.5:1) and lists any
  hard-coded hex/rgba left in component CSS for review.
- Screenshots of sidebar+editor, mail and calendar after the change, compared with before.
- The user checks the built app; anything they dislike is reverted per screen.
