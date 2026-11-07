/** Mail tables in noted.db. BetterAI/Engines/MailEngine.py creates the same ones (a test there compares them). */
/** Columns added after the first version: [table, column, type]. Added to existing databases at startup. */
export const MAIL_COLUMNS: [string, string, string][] = [['mail_message', 'reply_to', 'TEXT']];

export const MAIL_SCHEMA = `
CREATE TABLE IF NOT EXISTS mail_message (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gm_msgid TEXT NOT NULL UNIQUE,
  gm_thrid TEXT,
  uid INTEGER,
  message_id TEXT,
  from_name TEXT,
  from_addr TEXT,
  to_addrs TEXT,
  cc TEXT,
  reply_to TEXT,
  subject TEXT,
  date TEXT,
  preview TEXT,
  body_text TEXT,
  body_html TEXT,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  unread INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  filtered INTEGER NOT NULL DEFAULT 0,
  filter_reason TEXT
);
CREATE INDEX IF NOT EXISTS mail_message_date ON mail_message(date);
CREATE TABLE IF NOT EXISTS mail_attachment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES mail_message(id) ON DELETE CASCADE,
  filename TEXT,
  mime TEXT,
  size INTEGER,
  part_id TEXT,
  cached_path TEXT
);
CREATE TABLE IF NOT EXISTS mail_outbox (
  client_id TEXT PRIMARY KEY,
  to_addrs TEXT NOT NULL,
  cc TEXT,
  subject TEXT,
  body TEXT,
  in_reply_to INTEGER,
  attachments TEXT,
  state TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  send_after TEXT NOT NULL,
  sent_at TEXT
);
CREATE TABLE IF NOT EXISTS mail_sender_rule (
  addr TEXT NOT NULL,
  rule TEXT NOT NULL,
  PRIMARY KEY (addr, rule)
);
CREATE TABLE IF NOT EXISTS mail_state (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;
