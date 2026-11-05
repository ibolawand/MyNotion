import { Component } from '@angular/core';
import { ModelService } from '../model.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-starting-page',
  imports: [],
  templateUrl: './starting-page.html',
  styleUrl: './starting-page.css'
})
export class StartingPage {
  constructor(public modelService: ModelService, private router: Router) { }
  public openHome() {
    this.modelService.openDashboard();
  }
  public openCalendar() {
    this.router.navigate(['/calendar']);
  }
  public openNotebooks() {
    this.router.navigate(['/notebooks']);
  }
}
