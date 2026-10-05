import { Injectable } from '@angular/core';
import { Category, Folder, Note, User } from '../model/models';
import { Subject, Observable, BehaviorSubject, debounceTime, distinctUntilChanged, switchMap, tap, Subscription, of, from } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
export enum SaveStatus {
  IDLE = 'idle',
  SAVING = 'saving',
  SAVED = 'saved',
  ERROR = 'error'
}
declare global {
  interface Window {
    electronAPI: {
      notes: {
        createNote: (note: Note) => Promise<{ ok: boolean; id?: number; error?: string }>;
        updateNote: (note: Note) => Promise<{ ok: boolean; error?: string }>;
        getAllNotes: (userId:number) => Promise<Note[]>;
        getNoteWithCertainCategory: (categoryID: number,userID:number) => Promise<Note[]>;
        deleteNote: (id: number) => Promise<{ ok: boolean; error?: string }>;
        getCategories: (userId: number) => Promise<Category[]>;
        createCategory: (category: Partial<Category>) => Promise<Category>;
        deleteCategory: (categoryID: number) => Promise<void>;
        createUser: (user: User) => Promise<User>;
        login: (user: User) => Promise<User>;
        logout: (user: User) => Promise<void>;
        getToken: () => Promise<string | null>;
        saveToken: (token: string) => Promise<void>;
        removeToken: () => Promise<void>;
      };
      folder: {
        addFolder: (folder: any) => Promise<any>,
        getAllFolders: () => Promise<Folder[]>,
        deleteFolder: (folder: Folder) => Promise<void>,
      },
      window: {
        minimizeWindow: () => Promise<void>,
        maximizeWindow: () => Promise<void>,
        closeWindow: () => Promise<void>,
      }
    };
  }
}

@Injectable({ providedIn: 'root' })
export class NoteService {
  private userIdSource = new BehaviorSubject<number>(0);

  constructor(private http: HttpClient) {
    const storedId = localStorage.getItem('userId');
    if (storedId) {
      this.userIdSource.next(Number(storedId));
    }
  }

  //#region Auth
  public async getToken() {
    return await window.electronAPI.notes.getToken();
  }
  public async saveToken(token: string) {
    return await window.electronAPI.notes.saveToken(token);
  }
  public async removeToken() {
    return await window.electronAPI.notes.removeToken();
  }

  //#region Notes
  private notesChangedSubject = new Subject<Note>();
  private saveSubject = new Subject<Note>();

  private saveSub?: Subscription;
  private saveStatusSubject = new BehaviorSubject<SaveStatus>(SaveStatus.IDLE);
  public readonly saveStatus$ = this.saveStatusSubject.asObservable();



  // shared notes cache and observable
  private notesCache: Note[] = [];
  private notesSubject: BehaviorSubject<Note[]> = new BehaviorSubject<Note[]>([]);
  public readonly notes$ = this.notesSubject.asObservable();




  public readonly notesChanged$: Observable<Note> = this.notesChangedSubject.asObservable();

  async createNote(note: Note) {
    if (note.userID === undefined || note.userID === null || note.userID === 0) {
      note.userID = this.getUserId();
    }
    const res = await window.electronAPI.notes.createNote(note);
    if (res && res.ok) {
      if (res.id) note.id = res.id;
      // Check if it's already in cache (e.g. from triggerAutoSave)
      const existingIdx = this.notesCache.findIndex(n => n.id === note.id);
      if (existingIdx !== -1) {
        this.notesCache[existingIdx] = { ...this.notesCache[existingIdx], ...note };
      } else {
        this.notesCache.unshift(note);
      }
      this.notesSubject.next([...this.notesCache]);
      this.notesChangedSubject.next(note);
    }
    return res;
  }
  private initAutoSave() {
    this.saveSub = this.saveSubject.pipe(
      debounceTime(600),
      distinctUntilChanged((previous, current) => previous.content === current.content && previous.title === current.title),
      switchMap(note => {
        this.saveStatusSubject.next(SaveStatus.SAVING);
        if (note.id !== undefined && note.id !== null) {
          return from(this.updateNote(note));
        }
        return from(this.createNote(note));
      }),
      tap((res: any) => {
        if (res && res.ok) {
          this.saveStatusSubject.next(SaveStatus.SAVED);
        } else {
          this.saveStatusSubject.next(SaveStatus.ERROR);
        }
      })
    ).subscribe();
  }

  async deleteNote(id: number) {
    const res = await window.electronAPI.notes.deleteNote(id);
    if (res && res.ok) {
      this.notesCache = this.notesCache.filter(n => n.id !== id);
      this.notesSubject.next([...this.notesCache]);
    }
    return res;
  }



  // load notes from backend into shared cache
  async loadNotes(): Promise<void> {
    try {
      const rows = await window.electronAPI.notes.getAllNotes(this.userIdSource.value);
      this.notesCache = Array.isArray(rows) ? rows : [];
      this.notesSubject.next([...this.notesCache]);
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
  }

  // update an existing note
  async updateNote(note: Note) {
    const res = await window.electronAPI.notes.updateNote(note);
    if (res && res.ok) {
      const idx = this.notesCache.findIndex(n => n.id === note.id);
      if (idx !== -1) {
        this.notesCache[idx] = { ...this.notesCache[idx], ...note };
      } else {
        this.notesCache.unshift(note);
      }
      this.notesSubject.next([...this.notesCache]);
      this.notesChangedSubject.next(note);
    }
    return res;
  }

  notifyNoteChanged(note: Note): void {
    this.notesChangedSubject.next(note);
  }

  private saveNoteToElectron(note: Note) {
    if (note.userID === undefined || note.userID === null || note.userID === 0) {
      note.userID = this.getUserId();
    }
    return window.electronAPI.notes.createNote(note);
  }

  // Public method components can call to trigger a debounced auto-save
  triggerAutoSave(note: Note) {
    // lazy init the autosave pipeline
    if (!this.saveSub) this.initAutoSave();

    // Update cache immediately for real-time UI updates
    if (note.id !== undefined && note.id !== null) {
      const idx = this.notesCache.findIndex(n => n.id === note.id);
      if (idx !== -1) {
        this.notesCache[idx] = { ...this.notesCache[idx], ...note };
      }
    } else {
      // For new notes being typed, we don't have an ID yet.
      // We might want to avoid adding them to the cache multiple times.
      // Usually, the first auto-save will create it and set the ID.
    }
    this.notesSubject.next([...this.notesCache]);

    this.saveSubject.next(note);
  }

  public getNotesCache(): Note[] {
    return this.notesCache;
  }

  //#endregion

  //#region Categories

  //region shared categories cache and observable
  private categoriesCache: Category[] = [];
  private categoriesSubject: BehaviorSubject<Category[]> = new BehaviorSubject<Category[]>([]);
  public readonly categories$ = this.categoriesSubject.asObservable();


  private categoriesChangedSubject = new Subject<void>();
  public readonly categoriesChanged$: Observable<void> = this.categoriesChangedSubject.asObservable();

  async getNoteWithCertainCategory(categoryID: number) {
    const userId = this.getUserId();
    const res = await window.electronAPI.notes.getNoteWithCertainCategory(categoryID, userId);
    console.log('NoteService.getNoteWithCertainCategory', categoryID, res);
    return res;
  }

  async getCategoriesFromElectron() {
    const userId: number = this.userIdSource.getValue();
    return await window.electronAPI.notes.getCategories(userId);
  }
  async loadCategories() {
    try {
      const rows = await this.getCategoriesFromElectron();
      console.log("uwuw",rows);
      this.categoriesCache = Array.isArray(rows) ? rows : [];
      this.categoriesSubject.next([...this.categoriesCache]);
      console.log('Categories loaded:', this.categoriesCache);
    } catch (e) {
      console.error('Failed to load categories:', e);
    }
  }

  async addCategory(category: Partial<Category>) {
    return await window.electronAPI.notes.createCategory(category);
  }

  async deleteCategory(categoryID: number) {
    return await window.electronAPI.notes.deleteCategory(categoryID);
  }

  notifyCategoriesChanged(categoryID: number): void {
    this.categoriesChangedSubject.next();
  }
  getCategories() {
    return this.categories$;
  }


  //#endregion


  //#region folders
  private isFolderAdded: Subject<void> = new Subject<void>();
  public readonly folderChanged$ = this.isFolderAdded.asObservable();

  async getFolders(): Promise<Folder[]> {
    return await window.electronAPI.folder.getAllFolders();
  }
  async addFolder(folder: Folder): Promise<void> {
    return await window.electronAPI.folder.addFolder(folder);
  }
  async deleteFolder(folder: Folder): Promise<void> {
    return await window.electronAPI.folder.deleteFolder(folder);
  }
  notifyFolderChanged(): void {
    this.isFolderAdded.next();
  }
  //#endregion

  //#region User


  async createUser(user: User): Promise<User> {
    return await window.electronAPI.notes.createUser(user);
  }
  async login(user: User): Promise<User> {
    const loggedInUser = await window.electronAPI.notes.login(user);
    this.checkUser(loggedInUser, loggedInUser.id);
    return loggedInUser;
  }
  async createAccount(user: User): Promise<User> {
    const createdUser = await window.electronAPI.notes.createUser(user);
    console.log('createdUser', createdUser);
    this.checkUser(createdUser, createdUser.id);
    return createdUser;
  }
  getUserId(): number {
    return this.userIdSource.value;
  }
  checkUser(givenUser: User, userid: number) {
    if (givenUser && userid) {
      localStorage.setItem('userId', String(userid));
      this.userIdSource.next(userid);
      return true;
    }
    return false;
  }

  //#endregion

  //#region Dashboard
  public async maximizeWindow() {
    return await window.electronAPI.window.maximizeWindow();
  }
  public async minimizeWindow() {
    return await window.electronAPI.window.minimizeWindow();
  }
  public async closeWindow() {
    return await window.electronAPI.window.closeWindow();
  }
  //#endregion Dashboard
}
