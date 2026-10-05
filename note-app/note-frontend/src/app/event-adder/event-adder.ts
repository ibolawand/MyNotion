import { Component, OnInit } from '@angular/core';
import { ModelService } from '../model.service';
import { FormsModule } from '@angular/forms';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-event-adder',
  standalone: true,
  imports: [FormsModule, AsyncPipe],
  templateUrl: './event-adder.html',
  styleUrl: './event-adder.css'
})
export class EventAdder implements OnInit {
  title = '';
  startTime = '';
  endTime = '';
  description = '';

  constructor(private modelService: ModelService) { }

  ngOnInit() {
    this.modelService.selectedDate$.subscribe(date => {
      if (date) {
        this.startTime = this.formatDateForInput(date);

        const end = new Date(date);
        end.setHours(end.getHours() + 1);
        this.endTime = this.formatDateForInput(end);
      }
    });
  }

  private formatDateForInput(date: Date): string {
    // Format: YYYY-MM-DDTHH:mm
    const pad = (n: number) => n < 10 ? '0' + n : n;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  close() {
    this.modelService.closeEventAdder();
  }

  submit() {
    console.log('Event created:', {
      title: this.title,
      start: this.startTime,
      end: this.endTime,
      description: this.description
    });
    this.close();
  }
}
