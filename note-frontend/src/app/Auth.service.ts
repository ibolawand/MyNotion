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
    /** No login: MyNotion is a local single-person app, so open the local profile straight away. */
    async checkAuthState() {
        const user = await window.electronAPI?.notes.getLocalUser?.();
        const loggedIn = !!user;
        if (user) {
            this.noteService.checkUser(user as any, user.id);
        }
        this.loggedIn.next(loggedIn);

        // Keep ModelService in sync so the shell shows the dashboard
        // (the create-account form only appears if the database couldn't be opened).
        this.modelService.isLoggedIn.next(loggedIn);
        if (loggedIn) {
            this.modelService.openDashboard();
        }
    }
    isUserLoggedIn() {
        return this.loggedIn.asObservable();
    }
}
