import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { AsyncPipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModelService } from '../model.service';
import { CalendarEvent, EventRow, WeekDay, EventForm } from '../../model/models';
import { NoteService } from '../../services/NoteService';



const FIRST_HOUR = 8;   // grid starts at 8 AM
const LAST_HOUR = 23;   // grid ends at 11 PM (last label is 10 PM)
 
@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    AsyncPipe,
    NgClass,
    FormsModule
  ],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css'
})
export class Calendar implements OnInit, OnDestroy {
 
  currentWeekStart = this.getWeekStart(new Date());
  private timeIndicatorInterval: any;
  currentTimePosition = 0;
  currentDayIndex = -1;
 
  hours = [
    '8 AM', '9 AM', '10 AM', '11 AM', '12 PM',
    '1 PM', '2 PM', '3 PM', '4 PM', '5 PM',
    '6 PM', '7 PM', '8 PM', '9 PM', '10 PM'
  ];
 
  dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  weekDates: WeekDay[] = [];
 
  events: CalendarEvent[] = [];
 
  // ---------- Add-event dialog ----------
  showAddEvent = false;
  saving = false;
  formError = '';
  form: EventForm = this.emptyForm();
 
  colors = ['blue', 'green', 'purple', 'red'];
  durations = [
    { value: 0.5, label: '30 min' },
    { value: 1, label: '1 hour' },
    { value: 1.5, label: '1.5 hours' },
    { value: 2, label: '2 hours' },
    { value: 3, label: '3 hours' },
    { value: 4, label: '4 hours' }
  ];
 
  constructor(public modelService: ModelService, private noteService: NoteService, private cdr: ChangeDetectorRef) {
  }
 
  // ==================== BACKEND (Electron IPC) ====================
  /** TODO: replace with the id of the logged-in user (same one your notes use) */
  private get userId(): number {
    console.log('Getting user ID from NoteService...');
    console.log('User ID:', this.noteService.getUserId());
    return this.noteService.getUserId();
  }
 
  async loadEvents(): Promise<void> {
    try {
      const rows: CalendarEvent[] = await this.noteService.getAllEvents(this.userId);
 
      // SQLite returns allDay as 0/1 and NULL for unused columns -> normalize once here
      this.events = rows.map(r => ({
        id: r.id,
        userID: r.userID,
        date: r.date,
        title: r.title,
        allDay: !!r.allDay,
        startHour: r.startHour ?? 0,
        duration: r.duration ?? 0,
        color: r.color ?? ''
      }));
    } catch (err) {
      console.error('Could not load events:', err);
    }
    this.cdr.detectChanges();
  }
 
  ngOnInit(): void {
    this.updateWeekData();
    this.loadEvents();
    this.timeIndicatorInterval = setInterval(() => this.updateCurrentTimeIndicator(), 60000);
  }
 
  ngOnDestroy(): void {
    if (this.timeIndicatorInterval) {
      clearInterval(this.timeIndicatorInterval);
    }
  }
 
  // ==================== HELPERS ====================
  private pad(n: number): string {
    return n < 10 ? '0' + n : String(n);
  }
 
  private toIso(d: Date): string {
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
  }
 
  private emptyForm(): EventForm {
    return { title: '', date: this.toIso(new Date()), start: '09:00', duration: 1, color: 'blue', allDay: false };
  }
 
  getWeekStart(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }
 
  get weekRangeText(): string {
    const weekStart = this.currentWeekStart;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
 
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 
    if (weekStart.getMonth() === weekEnd.getMonth()) {
      return `${months[weekStart.getMonth()]} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
    }
    return `${months[weekStart.getMonth()]} ${weekStart.getDate()} - ${months[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  }
 
  updateWeekData(): void {
    this.weekDates = [];
    const todayIso = this.toIso(new Date());
 
    for (let i = 0; i < 7; i++) {
      const date = new Date(this.currentWeekStart);
      date.setDate(date.getDate() + i);
      const iso = this.toIso(date);
      this.weekDates.push({
        date: date.getDate(),
        iso,
        dayName: this.dayNames[i],
        isToday: iso === todayIso
      });
    }
    this.updateCurrentTimeIndicator();
  }
 
  updateCurrentTimeIndicator(): void {
    const now = new Date();
    // Only show the indicator when today is part of the visible week
    this.currentDayIndex = this.weekDates.findIndex(d => d.isToday);
 
    const currentHour = now.getHours();
    if (currentHour >= FIRST_HOUR && currentHour < LAST_HOUR) {
      this.currentTimePosition = ((currentHour - FIRST_HOUR) * 100) + (now.getMinutes() * 100 / 60);
    } else {
      this.currentTimePosition = -1;
    }
  }
 
  getEventsForDay(dayIndex: number): CalendarEvent[] {
    const iso = this.weekDates[dayIndex]?.iso;
    return this.events.filter(e => e.date === iso && !e.allDay);
  }
 
  getAllDayEventsForDay(dayIndex: number): CalendarEvent[] {
    const iso = this.weekDates[dayIndex]?.iso;
    return this.events.filter(e => e.date === iso && e.allDay);
  }
 
  private formatHour(hour: number): string {
    const h24 = Math.floor(hour);
    const minutes = Math.round((hour - h24) * 60);
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    return `${h12}:${this.pad(minutes)} ${suffix}`;
  }
 
  formatEventTime(startHour: number, duration: number): string {
    return `${this.formatHour(startHour)} - ${this.formatHour(startHour + duration)}`;
  }
 
  // ==================== ADD / DELETE EVENTS ====================
  /** Opened by the "+ New Event" button (no args) or by clicking an hour slot. */
  openAddEvent(iso?: string, hour?: number): void {
    const now = new Date();
    const startHour = hour ?? Math.min(Math.max(now.getHours() + 1, FIRST_HOUR), LAST_HOUR - 1);
 
    this.form = {
      title: '',
      date: iso ?? this.toIso(now),
      start: `${this.pad(startHour)}:00`,
      duration: 1,
      color: 'blue',
      allDay: false
    };
    this.formError = '';
    this.showAddEvent = true;
  }
 
  createEvent(day: number, hour: number): void {
    this.openAddEvent(this.weekDates[day].iso, hour);
  }
 
  @HostListener('document:keydown.escape')
  closeAddEvent(): void {
    this.showAddEvent = false;
  }
 
  async saveEvent(): Promise<void> {
    if (this.saving) return;
 
    const f = this.form;
    const title = f.title.trim();
 
    if (!title) {
      this.formError = 'Please enter a title.';
      return;
    }
    if (!f.date) {
      this.formError = 'Please pick a date.';
      return;
    }
 
    let startHour = 0;
    let duration = 0;
 
    if (!f.allDay) {
      const [h, m] = f.start.split(':').map(Number);
      startHour = h + m / 60;
 
      if (isNaN(startHour) || startHour < FIRST_HOUR || startHour >= LAST_HOUR) {
        this.formError = 'Start time must be between 8:00 AM and 10:45 PM.';
        return;
      }
      duration = Math.min(f.duration, LAST_HOUR - startHour); // never run past the grid
    }
 
    const newEvent: Omit<CalendarEvent, 'id'> = {
      userID: this.userId,
      date: f.date,
      title,
      allDay: f.allDay,
      startHour,
      duration,
      color: f.allDay ? '' : f.color
    };
 
    this.saving = true;
    try {
      const res = await this.noteService.createEvent({
        ...newEvent,
        // all-day events have no time/color in the database
        startHour: f.allDay ? null : startHour,
        duration: f.allDay ? null : duration,
        color: f.allDay ? null : f.color
      });
 
      if (!res?.ok) {
        this.formError = 'Could not save the event. Please try again.';
        return;
      }
 
      this.events = [...this.events, { id: res.id, ...newEvent }];
 
      // Jump to the week of the new event so it is visible right away
      this.currentWeekStart = this.getWeekStart(new Date(f.date + 'T00:00:00'));
      this.updateWeekData();
      this.closeAddEvent();
    } catch (err) {
      console.error('saveEvent error:', err);
      this.formError = 'Could not save the event. Please try again.';
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }
 
  async deleteEvent(id: number): Promise<void> {
    const res = await this.noteService.deleteEvent(id);
    if (res?.ok) {
      this.events = this.events.filter(e => e.id !== id);
      this.cdr.detectChanges();
    }
  }
 
  // ==================== NAVIGATION ====================
  previousWeek(): void {
    this.currentWeekStart.setDate(this.currentWeekStart.getDate() - 7);
    this.updateWeekData();
  }
 
  nextWeek(): void {
    this.currentWeekStart.setDate(this.currentWeekStart.getDate() + 7);
    this.updateWeekData();
  }
 
  goToToday(): void {
    this.currentWeekStart = this.getWeekStart(new Date());
    this.updateWeekData();
  }
}
 