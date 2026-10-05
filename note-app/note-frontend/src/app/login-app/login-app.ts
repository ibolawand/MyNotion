import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { User } from '../../model/models';
import { NoteService } from '../../services/NoteService';
import { ModelService } from '../model.service';


@Component({
  selector: 'login-app',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login-app.html',
  styleUrl: './login-app.css'
})
export class LoginApp {
  user: User = {
    id: 0,
    username: '',
    email: '',
    password: '',
    logged_in: false,
  };

  constructor(
    private router: Router,
    private noteService: NoteService,
    private modelService: ModelService
  ) { }

  onSubmit() {
    this.noteService.login(this.user).then(loggedInUser => {
      if (loggedInUser) {
        this.modelService.isLoggedIn.next(true);
        this.modelService.openDashboard();
        this.noteService.maximizeWindow();
        this.router.navigate(['/']);
      } else {
        alert('Invalid username or password');
      }
    });
  }
}
