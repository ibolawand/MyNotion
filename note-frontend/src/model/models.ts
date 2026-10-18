export interface Note {
  id?: number,
  title: string,
  content: string,
  categoryID: number,
  userID?: number,
  folderID?: number,
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
}


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
}
