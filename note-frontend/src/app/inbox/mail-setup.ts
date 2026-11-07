import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MailService } from '../../services/MailService';

/** First time: the Gmail address and an app password (no Google Cloud project needed). */
@Component({
  selector: 'app-mail-setup',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './mail-setup.html',
  styleUrl: './mail-setup.css',
})
export class MailSetup {
  address = '';
  password = '';
  error = '';
  checking = false;

  constructor(private mail: MailService) {}

  async connect() {
    this.checking = true;
    this.error = '';
    const r = await this.mail.setup(this.address, this.password);
    this.checking = false;
    if (!r.ok) this.error = r.error ?? "Couldn't connect.";
    else this.password = '';
  }
}
