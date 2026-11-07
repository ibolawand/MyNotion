# Mail in MyNotion, with Aria — design

Date: 2026-11-07. Status: agreed in chat, waiting for review of this file.

## What it's for

Lala's own Gmail client, so email lives next to notes and the calendar instead of in a browser tab:

- read and reply like a normal client (inbox, open, reply, write, attachments, search, archive)
- and mostly by voice through Aria ("any new emails?", "read the one from Mr. Huber", "reply that I'll be there at 3")
- **no promotions, ads, newsletters or spam**

Constraints:

- **no Google Cloud project** (no OAuth app). Gmail is reached with IMAP/SMTP and an **app password**
  (needs 2-step verification on the Google account; made at myaccount.google.com/apppasswords)
- one Gmail account
- local only: the password lives in the system keyring, mail in MyNotion's SQLite file
- MyNotion keeps its current dark/green look

Success: new Primary-tab mail appears in MyNotion within ~2 minutes; no promotion or newsletter shows in the inbox;
Aria can say what's new, read an email, and send a reply after a spoken yes; nothing is ever sent without that yes.

## Architecture

```
Gmail ──IMAP/SMTP──► MyNotion main process (note/src/mail/)  ──► noted.db: mail tables
                          │                                          ▲
                          ▼                                          │ reads
                  MyNotion window: Inbox section               Aria (Engines/MailEngine.py)
                                                                     │
                                       send / archive / fresh check ─┴──► Gmail directly
          app password: system keyring (Secret Service), read by both
```

MyNotion is the one that keeps the local copy in sync. Aria reads that copy like she reads notes, and talks to Gmail
herself only to send, to archive/mark read, and to check for new mail when MyNotion isn't running (so she never
answers from a stale copy).

## MyNotion: main process (`note/src/mail/`)

Libraries: `imapflow` (IMAP), `nodemailer` (SMTP), `mailparser` (parsing), a keyring binding for Secret Service
(`@napi-rs/keyring`; to be verified that Aria can read the same entry, see Open points).

- `account.ts`: address + app password. `mail:setup` checks the login against Gmail before saving; the password
  goes only into the keyring (service `MyNotion Mail`, account = the address), never into the DB or a file.
- `sync.ts`: every 2 minutes and on "refresh":
  - INBOX, only Gmail's Primary category: IMAP search with Gmail's extension `X-GM-RAW "category:primary"`.
  - first sync: last 3 months (setting), newest first, so the list fills quickly; later syncs: by UID since the
    last one, plus flag changes (read/unread, archived elsewhere).
  - stores headers, a text preview, the full body (text and sanitised-at-display HTML) and the attachment list.
    Attachments themselves are fetched when opened (`mail:attachment`), into a cache folder.
  - Gmail IDs (`X-GM-MSGID`, `X-GM-THRID`) are stored so actions and threads stay stable.
- `filter.ts`: a second net for what slips into Primary. Hidden as "filtered" when the mail has
  `List-Unsubscribe` / `List-Id`, `Precedence: bulk|list`, or a known bulk-sender pattern, unless the sender is on
  the "always show" list. Pure function, no I/O, so it's easy to test.
- `send.ts`: SMTP via smtp.gmail.com:465. Replies set `In-Reply-To`/`References` so Gmail threads them.
  Every message gets a client ID; sending goes through an `outbox` table, so offline mail waits and nothing is
  sent twice (MyNotion and Aria both check the outbox state). Gmail puts sent mail in "Sent" itself.
- `ipc`: handlers in the style of `requestHandler.ts`: `mail:setup`, `mail:status`, `mail:list`, `mail:get`,
  `mail:send`, `mail:archive`, `mail:mark-read`, `mail:not-junk`, `mail:attachment`, `mail:refresh`.
  The renderer is told about new mail with the existing `db-changed` event.

### Tables (in `noted.db`)

- `mail_message`: id, gm_msgid (unique), gm_thrid, uid, from_name, from_addr, to, cc, subject, date, preview,
  body_text, body_html, has_attachments, unread, archived, filtered, filter_reason
- `mail_attachment`: id, message_id, filename, mime, size, part_id, cached_path
- `mail_outbox`: client_id (unique), to, cc, subject, body, in_reply_to, attachments, state (queued / sending /
  sent / failed), error, created_by (`mynotion` / `aria`), created_at, sent_at
- `mail_sender_rule`: addr, rule (`always_show` / `important`)
- `mail_state`: last UID, UIDVALIDITY, last sync time, last error

## MyNotion: the window

- Sidebar entry **Inbox** with an unread count. Three views: list (sender, subject, time, unread dot),
  email (with Reply / Archive / "Remind me" / "Make event"), and writing (to, subject, text, attachments).
- **Filtered** view: what the filter hid, each with "not junk" (adds `always_show` for that sender).
- HTML mail is shown in a sandboxed iframe: no scripts, remote images blocked until "show images", links open in the
  system browser (the existing `setWindowOpenHandler`).
- Search over sender, subject and body of what's synced.
- Status line: "Offline, last checked 14:05" / "Gmail didn't accept the password …".
- Existing look: dark panels, green accent, the user's own sidebar styles.

## Aria (`Engines/MailEngine.py`)

Reads `noted.db` (like `NotionEngine`); for actions and fresh checks uses Python's `imaplib` / `smtplib` with the
same keyring entry. Writes outgoing mail into `mail_outbox` and sends it herself (marking the state), so it works
whether or not MyNotion is open.

Tools (added to Tool_Engine with a `mail` route group):

- `check_mail()`: "Two new: one from Mr. Huber about the project, one from Sara." If MyNotion isn't running,
  checks Gmail first (same Primary + filter rules, ported from `filter.ts`; one shared set of test cases keeps the
  two in step).
- `read_mail(which)`: by sender / subject / "the latest"; long mails get a short summary and an offer to read all.
- `search_mail(query)`.
- `draft_reply(which, gist)` / `draft_mail(to, gist)`: the model writes a short mail in Lala's style; Aria reads it
  back and asks "Send it?" through the existing Confirmer. Only a yes sends. "Undo" works for ~10 s (the outbox
  waits 10 s before sending).
- `archive_mail(which)`, `mark_read(which)`.
- `mail_todo(which, due)`: a to-do in MyNotion ("Answer Mr. Huber · due Sun 8 Nov") linking to the mail.
- `mail_to_event(which)`: date/time from the mail into the calendar, after a confirmation.
- Recipients come from addresses in synced mail; two matches -> she asks which.

On her own: the morning briefing mentions important new mail ("3 new emails, one from your teacher"). No
announcement per mail; for senders marked `important` ("always tell me when Sara emails") she says it when it
arrives, only while Lala is at the desk.

Never: send without a yes; delete mail (archive keeps it in All Mail); open attachments by herself.

## Errors

- Wrong/revoked app password: clear message with the link, no retry loop (avoids Google locking the account);
  Aria says the same when asked.
- Offline: local copy keeps working; outbox waits and sends when back.
- UIDVALIDITY changed: resync the window from scratch.
- Sending from both apps: the outbox client ID prevents doubles.

## Testing

- MyNotion: `filter.ts` against a set of real-world sample headers (newsletter, shop ad, bill, teacher, Gmail
  Updates); sync and send against a local fake IMAP/SMTP server, never the real account.
- Aria: pytest like the other engines (a temp `noted.db` with mail rows; `imaplib`/`smtplib` faked): "any new
  emails?", read, reply -> confirm -> sent, "undo", "remind me to answer that", plus a few opt-in real-model checks.
- The shared filter cases (one JSON file) run in both test suites.
- End: one real run with Lala: send yourself a mail, see it in MyNotion, have Aria read it, reply.

## Not in the first version

Several accounts; labels/folders beyond the Primary inbox; formatted (rich-text) writing; image signatures.

## Open points (to settle during the plan)

- Keyring: confirm `@napi-rs/keyring` (Node) and Python `keyring`/`secretstorage` see the same Secret Service
  entry; if not, MyNotion stores it and Aria looks it up by the same attributes with `secretstorage`.
- Gmail's IMAP must be on for the account (it is by default for new accounts; the setup screen links to the
  setting if login works but the mailbox can't be opened).
