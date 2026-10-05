import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { User } from '../../model/models';
import { NoteService } from '../../services/NoteService';
import { ModelService } from '../model.service';
import * as bcrypt from 'bcryptjs';

@Component({
  selector: 'app-create-account',
  imports: [FormsModule, RouterLink],
  templateUrl: './creat-account.html',
  styleUrl: './creat-account.css',
  standalone: true
})
export class CreateAccount {
  user: Partial<User> = {
    username: '',
    email: '',
    password: '',
    logged_in: false,
  }
  confirmPassword: string = '';

  constructor(private router: Router, private noteService: NoteService, private modelService: ModelService) { }

  async onSubmit() {
    if (this.user.password == "" || this.user.username == "" || this.user.email == "") {
      alert("Please fill in all the fields");
    } else {
      if (this.user.password != this.confirmPassword) {
        alert("Passwords do not match");
      }
      const hashedPassword = await bcrypt.hash(this.user.password!, 10);
      this.user.password = hashedPassword;
      this.user.logged_in = true;
      const createdUser = await this.noteService.createAccount(this.user as User);

      // Check if account creation was successful
      if (!createdUser || !createdUser.id) {
        alert("Failed to create account. User may already exist.");
        return;
      }
      this.modelService.isLoggedIn.next(true);
      this.modelService.openDashboard();
      this.noteService.maximizeWindow();
      this.router.navigate(['/']);
      console.log(this.modelService.isLoggedIn.value);
    }
  }
}
