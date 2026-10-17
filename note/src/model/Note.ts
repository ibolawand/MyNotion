interface Note {
    title: string,
    content: string,
    categoryID: number,
    userID:number,
}
interface Category {
    id: number,
    name: string,
    userID: number,
}

interface Folder {
    id: number,
    name: string,
    colour: string,
}
interface User {
    id: number,
    username: string,
    email: string,
    password: string,
    logged_in: boolean,
}
interface CalendarEvent {
  id: number;         // database id
  date: string;       // 'YYYY-MM-DD' (local time)
  title: string;
  allDay: boolean;
  startHour: number;  // 8 - 23, fractions allowed (9.5 = 9:30); 0 for all-day
  duration: number;   // in hours; 0 for all-day
  color: string;
  userID: number;     // '' for all-day
}
