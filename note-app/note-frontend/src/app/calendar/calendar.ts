import { Component, OnInit, OnDestroy } from '@angular/core';
import { ModelService } from '../model.service';
import { AsyncPipe, NgClass } from '@angular/common';

interface CalendarEvent {
  day: number;
  startHour: number;
  duration: number;
  title: string;
  color: string;
}

interface AllDayEvent {
  day: number;
  title: string;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    AsyncPipe,
    NgClass
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
  weekDates: { date: number, dayName: string, isToday: boolean }[] = [];

  // Sample events
  events: CalendarEvent[] = [
    { day: 6, startHour: 20, duration: 1, title: 'Evening Meeting', color: 'red' },
    { day: 0, startHour: 10, duration: 2, title: 'Team Sync', color: 'blue' },
    { day: 2, startHour: 14, duration: 1.5, title: 'Project Review', color: 'green' },
    { day: 4, startHour: 16, duration: 1, title: 'Client Call', color: 'purple' }
  ];

  allDayEvents: AllDayEvent[] = [
    { day: 6, title: 'Ende der Sommerzeit' },
    { day: 6, title: 'Nationalfeiertag' }
  ];

  constructor(public modelService: ModelService) {
  }

  ngOnInit(): void {
    this.updateWeekData();
    this.updateCurrentTimeIndicator();
    this.timeIndicatorInterval = setInterval(() => this.updateCurrentTimeIndicator(), 60000);
  }

  ngOnDestroy(): void {
    if (this.timeIndicatorInterval) {
      clearInterval(this.timeIndicatorInterval);
    }
  }

  getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  get weekRangeText(): string {
    const weekStart = this.currentWeekStart;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (weekStart.getMonth() === weekEnd.getMonth()) {
      return `${months[weekStart.getMonth()]} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
    } else {
      return `${months[weekStart.getMonth()]} ${weekStart.getDate()} - ${months[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
    }
  }

  updateWeekData(): void {
    this.weekDates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const date = new Date(this.currentWeekStart);
      date.setDate(date.getDate() + i);
      const isToday = date.getTime() === today.getTime();
      this.weekDates.push({
        date: date.getDate(),
        dayName: this.dayNames[i],
        isToday: isToday
      });
    }
  }

  updateCurrentTimeIndicator(): void {
    const now = new Date();
    this.currentDayIndex = now.getDay();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    if (currentHour >= 8 && currentHour <= 22) {
      this.currentTimePosition = ((currentHour - 8) * 100) + (currentMinute * 100 / 60);
    } else {
      this.currentTimePosition = -1; // Hide if out of range
    }
  }

  getEventsForDay(dayIndex: number): CalendarEvent[] {
    return this.events.filter(e => e.day === dayIndex);
  }

  getAllDayEventsForDay(dayIndex: number): AllDayEvent[] {
    return this.allDayEvents.filter(e => e.day === dayIndex);
  }

  formatEventTime(startHour: number, duration: number): string {
    const start = startHour > 12 ? `${startHour - 12}:00 PM` : `${startHour}:00 AM`;
    const endHour = startHour + duration;
    const minutes = (endHour % 1) * 60;
    const minuteStr = minutes === 0 ? '00' : minutes.toString();
    const end = endHour > 12 ? `${Math.floor(endHour - 12)}:${minuteStr} PM` : `${Math.floor(endHour)}:${minuteStr} AM`;
    return `${start} - ${end}`;
  }

  createEvent(day: number, hour: number): void {
    const date = new Date(this.currentWeekStart);
    date.setDate(date.getDate() + day);
    date.setHours(hour, 0, 0, 0);
    this.modelService.openEventAdder(date);

  }

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