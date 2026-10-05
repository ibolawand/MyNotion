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
        if (token) {
            this.loggedIn.next(true);
        } else {
            this.loggedIn.next(false);
        }

    }
    isUserLoggedIn() {
        return this.loggedIn.asObservable();
    }
}
