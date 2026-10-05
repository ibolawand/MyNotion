export interface Note {
  id?: number,
  title: string,
  content: string,
  categoryID: number,
  userID?: number,
}
export interface Category {
  id: number,
  name: string,
  userID: number | null,
}
export interface Folder {
  id: number,
  name: string,
  colour: string,
}

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

export type CalendarEvent = {
  day: number;
  startHour: number;
  duration: number;
  title: string;
  color: string;
}
export interface User {
  id: number,
  username: string,
  email: string,
  password: string,
  logged_in: boolean,
}

