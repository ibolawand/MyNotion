export interface Note {
  id?: number,
  title: string,
  content: string,
  categoryID: number,
  userID?: number,
  folderID?: number,
  pinned?: number | boolean,   // the star: listed first
}
export interface Category {
  id: number,
  name: string,
  userID: number | null,
}
export interface Folder { id: number; name: string; colour?: string; userID: number; parentID: number | null; }
export interface FolderRow { folder: Folder; depth: number; hasChildren: boolean; }


export interface ToolbarFormat {
  command: string;
  label: string;
  title: string;
  checkActive: string;
}
export interface ToolbarHeading {
  level: 1 | 2 | 3;
  label: string;
  title: string;
}

export interface ToolbarList {
  command: string;
  icon: string;
  title: string;
  checkActive: string;
}

export interface ToolbarHighlight {
  color: string;
  label: string;
}


export interface User {
  id: number,
  username: string,
  email: string,
  password: string,
  logged_in: boolean,
}
export interface CalendarEvent {
  id: number;         // database id
  date: string;       // 'YYYY-MM-DD' (local time)
  title: string;
  allDay: boolean;
  startHour: number;  // 8 - 23, fractions allowed (9.5 = 9:30); 0 for all-day
  duration: number;   // in hours; 0 for all-day
  color: string;      // '' for all-day
  userID: number;     // '' for all-day
  repeat?: Repeat | null;   // repeating event: shown on every matching day from `date` on
}

export type Repeat = 'daily' | 'weekly' | 'monthly' | 'yearly';


/** One row of the `events` table as returned by getAllEvents */
export interface EventRow {
  id: number;
  date: string;
  startHour: number | null;
  duration: number | null;
  title: string;
  color: string | null;
  allDay: number;     // 0 / 1
  userID: number;
  repeat: Repeat | null;
}

export interface WeekDay {
  date: number;
  iso: string;
  dayName: string;
  isToday: boolean;
}

export interface EventForm {
  title: string;
  date: string;
  start: string;      // 'HH:mm'
  duration: number;
  color: string;
  allDay: boolean;
  repeat: Repeat | null;
}

// ── Mail (the Inbox; see note/src/mail) ──
export interface MailSummary {
  id: number; from_name: string; from_addr: string; subject: string; date: string; preview: string;
  unread: number; has_attachments: number; filtered: number; filter_reason: string | null; to_addrs: string;
}
export interface MailAttachment { id: number; filename: string; mime: string; size: number; }
export interface MailMessage extends MailSummary {
  body_text: string; body_html: string; cc: string; reply_to?: string | null; message_id: string | null; attachments: MailAttachment[];
}
export interface MailDraft { to: string; cc?: string; subject: string; body: string; inReplyToId?: number; attachments?: string[]; }
export interface MailProblem { client_id: string; to_addrs: string; subject: string; error: string; }
export interface MailStatus { configured: boolean; address?: string; online: boolean; lastSync?: string; error?: string; unread: number; problems?: MailProblem[]; }
export interface MailSendResult { state: 'sent' | 'queued' | 'sending' | 'failed'; error: string | null; }
