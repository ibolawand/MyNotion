import { Routes } from '@angular/router';
import { HomeApp } from './home-app/home-app';
import { CreateAccount } from './creat-account/creat-account';
import { LoginApp } from './login-app/login-app';
import { StartingPage } from './starting-page/starting-page';
import { Calendar } from './calendar/calendar';

export const routes: Routes = [
  { path: '', component: HomeApp },
  { path: 'landingpage', component: StartingPage },
  { path: 'create-account', component: CreateAccount },
  { path: 'login', component: LoginApp },
  { path: 'calendar', component: Calendar },

];
