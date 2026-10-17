import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ModelService } from './model.service';
import { NoteService } from '../services/NoteService';
@Injectable({ providedIn: 'root' })
export class AuthService {
    private loggedIn = new BehaviorSubject<boolean>(false);

    constructor(private http: HttpClient, private modelService: ModelService, private noteService: NoteService) {
    }
    async checkAuthState() {
        const token = await this.noteService.getToken();
        const loggedIn = !!token;
        this.loggedIn.next(loggedIn);

        // Keep ModelService in sync so the shell shows the dashboard
        // (instead of the create-account form) when a token is present.
        this.modelService.isLoggedIn.next(loggedIn);
        if (loggedIn) {
            this.modelService.openDashboard();
        }
    }
    isUserLoggedIn() {
        return this.loggedIn.asObservable();
    }
}
