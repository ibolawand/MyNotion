import { Injectable, NgZone } from '@angular/core';
import { Category, Folder, MailDraft, MailMessage, MailSendResult, MailStatus, MailSummary, Note, User } from '../model/models';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
export enum SaveStatus {
  IDLE = 'idle',
  SAVING = 'saving',
  SAVED = 'saved',
  ERROR = 'error'
}
/** What Aria sends back for a message from the Aria panel (note/src/aria.ts). */
export type AriaEvent = { id: string } & (
  | { type: 'text'; delta: string }
  | { type: 'done'; reply: string; tools: string[]; confirm: string | null; quiz?: boolean }
  | { type: 'proposal'; html: string }
  | { type: 'error'; message: string });
/** The Aria panel's study buttons (note/src/aria.ts). */
export type StudyAction = 'quiz' | 'explain' | 'prep';
/** "Select text, ask Aria": what is sent for a selection. */
export type AriaEditRequest = {
  action: 'rewrite' | 'shorter' | 'spelling' | 'table' | 'custom';
  html: string; instruction: string; title: string; context: string; previous: string;
};

declare global {
  interface Window {
    electronAPI: {
      notes: {
        createNote: (note: Note) => Promise<{ ok: boolean; id?: number; error?: string }>;
        updateNote: (note: Note) => Promise<{ ok: boolean; error?: string }>;
        setPinned: (id: number, pinned: boolean) => Promise<{ ok: boolean; error?: string }>;
        getAllNotes: (userId:number) => Promise<Note[]>;
        getNoteWithCertainCategory: (categoryID: number,userID:number) => Promise<Note[]>;
        getNoteInFolder: (folderId:number, userId:number) => Promise<Note[]>;
        deleteNote: (id: number) => Promise<{ ok: boolean; error?: string }>;
        getCategories: (userId: number) => Promise<Category[]>;
        createCategory: (category: Partial<Category>) => Promise<Category>;
        deleteCategory: (categoryID: number) => Promise<void>;
        getLocalUser: () => Promise<{ id: number; username: string } | null>;
        createUser: (user: User) => Promise<User>;
        login: (user: User) => Promise<User>;
        logout: (user: User) => Promise<void>;
        getToken: () => Promise<string | null>;
        saveToken: (token: string) => Promise<void>;
        removeToken: () => Promise<void>;
        exportPdf: (title: string, body: string, css: string, base: string) =>
          Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
        showPdf: (file: string) => Promise<void>;
      };
      folder: {
        addFolder: (folder: any) => Promise<any>,
        getAllFolders: (userId?: number) => Promise<Folder[]>,
        updateFolder: (folder: { id: number; name: string; colour?: string }) => Promise<any>;
        deleteFolder: (folder: Folder | number) => Promise<any>,
      },
      images: {
        /** Stores a picture for a note; `url` is the mynotion-image:// link to put in the note. */
        save: (bytes: Uint8Array) => Promise<{ ok: true; id: number; url: string } | { ok: false; error: string }>,
      },
      window: {
        minimizeWindow: () => Promise<void>,
        maximizeWindow: () => Promise<void>,
        closeWindow: () => Promise<void>,
      }
      calendar: {
        getAllEvents: (userId: number) => Promise<any>,
        createEvent: (event: any) => Promise<any>,
        updateEvent: (event: any) => Promise<any>,
        deleteEvent: (eventId: number) => Promise<any>,
      }
      mail?: {
        setup: (address: string, password: string) => Promise<{ ok: boolean; error?: string }>;
        status: () => Promise<MailStatus>;
        forget: () => Promise<void>;
        refresh: () => Promise<void>;
        list: (opts: { view: 'inbox' | 'filtered'; query?: string }) => Promise<MailSummary[]>;
        get: (id: number) => Promise<MailMessage | null>;
        markRead: (id: number, read: boolean) => Promise<void>;
        archive: (id: number) => Promise<void>;
        notJunk: (id: number) => Promise<void>;
        send: (draft: MailDraft) => Promise<MailSendResult>;
        retry: (clientId: string) => Promise<MailStatus>;
        discard: (clientId: string) => Promise<MailStatus>;
        pickAttachments: () => Promise<string[]>;
        openAttachment: (attachmentId: number) => Promise<{ ok: boolean; error?: string }>;
      };
      onDbChanged?: (callback: () => void) => () => void;
      aria?: {
        setOpenNote: (id: number | null) => Promise<void>;
        editing: () => Promise<number | null>;
        ask?: (text: string, tools?: boolean) => Promise<{ ok: true; id: string } | { ok: false; error: 'not-running' }>;
        edit?: (request: AriaEditRequest) => Promise<{ ok: true; id: string } | { ok: false; error: 'not-running' }>;
        study?: (action: StudyAction) => Promise<{ ok: true; id: string } | { ok: false; error: 'not-running' }>;
        status?: () => Promise<'running' | 'not-running'>;
        start?: () => Promise<{ ok: boolean; error?: 'no-launcher' | 'timeout' }>;
        onEvent?: (callback: (event: AriaEvent) => void) => () => void;
      };
      takeOpenTarget?: () => Promise<string | null>;
      onOpenTarget?: (callback: (target: string) => void) => () => void;
    };
  }
};

@Injectable({ providedIn: 'root' })
export class NoteService {
  private userIdSource = new BehaviorSubject<number>(0);

  constructor(private http: HttpClient, private zone: NgZone) {
    window.addEventListener('beforeunload', () => this.flushDeletes());
    const storedId = localStorage.getItem('userId');
    if (storedId) {
      this.userIdSource.next(Number(storedId));
    }
    // Another program (e.g. Aria) changed the database: reload everything that's cached.
    // The IPC callback arrives outside Angular's zone, so re-enter it for change detection.
    window.electronAPI?.onDbChanged?.(() => this.zone.run(() => this.reloadFromDatabase()));
    // closing the window: write what is still waiting for its autosave timer
    window.addEventListener('beforeunload', () => void this.flushSaves());
  }

  //#region Outside changes
  private externalChangeSubject = new Subject<void>();
  /** Emits after notes/categories/folders were reloaded because the database changed outside the app. */
  public readonly externalChange$ = this.externalChangeSubject.asObservable();
  private lastLocalEdit = 0;

  /** True while the user is typing (or just stopped), so outside changes don't overwrite the editor. */
  public isEditingLocally(): boolean {
    return Date.now() - this.lastLocalEdit < 2500;
  }

  private async reloadFromDatabase(): Promise<void> {
    if (!this.getUserId()) return;
    await this.loadNotes();
    await this.loadCategories();
    this.notifyFolderChanged();
    this.externalChangeSubject.next();
  }
  //#endregion

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
      const created = { updated_at: new Date().toISOString() } as any;
      if (existingIdx !== -1) {
        this.notesCache[existingIdx] = { ...this.notesCache[existingIdx], ...note, ...created };
      } else {
        this.notesCache.unshift({ ...note, ...created });
      }
      this.emitNotes();
      this.notesChangedSubject.next(note);
    }
    return res;
  }
  async deleteNote(id: number) {
    const res = await window.electronAPI.notes.deleteNote(id);
    if (res && res.ok) {
      this.notesCache = this.notesCache.filter(n => n.id !== id);
      this.emitNotes();
    }
    return res;
  }



  /** Publishes the notes, pinned (starred) ones first, otherwise in the order they came.
   *  Notes waiting to be deleted (the Undo bar is showing) are left out. */
  private emitNotes() {
    const shown = this.notesCache.filter(n => n.id == null || !this.pendingDeletes.has(n.id));
    this.notesSubject.next([...shown.filter(n => n.pinned), ...shown.filter(n => !n.pinned)]);
  }

  // ── delete with Undo: the note disappears at once and is really deleted UNDO_MS later ──
  private pendingDeletes = new Map<number, { note: Note; timer: any }>();
  private undoSubject = new BehaviorSubject<Note | null>(null);
  public readonly undoable$ = this.undoSubject.asObservable();
  static readonly UNDO_MS = 6000;

  deleteWithUndo(note: Note) {
    if (note.id == null) return;
    for (const id of [...this.pendingDeletes.keys()]) this.commitDelete(id);   // one Undo at a time
    const id = note.id;
    const timer = setTimeout(() => this.zone.run(() => this.commitDelete(id)), NoteService.UNDO_MS);
    this.pendingDeletes.set(id, { note, timer });
    this.emitNotes();
    this.undoSubject.next(note);
  }

  undoDelete() {
    const note = this.undoSubject.value;
    const pending = note?.id != null ? this.pendingDeletes.get(note.id) : undefined;
    if (!note || !pending) return;
    clearTimeout(pending.timer);
    this.pendingDeletes.delete(note.id!);
    this.undoSubject.next(null);
    this.emitNotes();
  }

  private async commitDelete(id: number) {
    const pending = this.pendingDeletes.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingDeletes.delete(id);
    if (this.undoSubject.value?.id === id) this.undoSubject.next(null);
    await this.deleteNote(id);
  }

  /** The window is closing: send the waiting deletes now (they'd otherwise come back next time). */
  flushDeletes() {
    for (const id of [...this.pendingDeletes.keys()]) this.commitDelete(id);
  }

  async setPinned(note: Note, pinned: boolean) {
    if (note.id == null) return { ok: false };
    const res = await window.electronAPI.notes.setPinned(note.id, pinned);
    if (res && res.ok) {
      note.pinned = pinned ? 1 : 0;
      const cached = this.notesCache.find(n => n.id === note.id);
      if (cached) cached.pinned = note.pinned;
      this.emitNotes();
    }
    return res;
  }

  // load notes from backend into shared cache
  async loadNotes(): Promise<void> {
    try {
      const rows = await window.electronAPI.notes.getAllNotes(this.userIdSource.value);
      const fresh: Note[] = Array.isArray(rows) ? rows : [];
      // typing that isn't saved yet wins over the (older) row in the database
      this.notesCache = fresh.map(n => n.id != null && this.unsaved.has(n.id) ? { ...n, ...this.unsaved.get(n.id)! } : n);
      this.emitNotes();
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
  }


  // update an existing note
  async updateNote(note: Note) {
    const res = await window.electronAPI.notes.updateNote(note);
    if (res && res.ok) {
      const idx = this.notesCache.findIndex(n => n.id === note.id);
      const edited = { updated_at: new Date().toISOString() } as any;   // the list shows when it was last edited
      if (idx !== -1) {
        this.notesCache[idx] = { ...this.notesCache[idx], ...note, ...edited };
      } else {
        this.notesCache.unshift({ ...note, ...edited });
      }
      this.emitNotes();
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

  // ── autosave ──
  // Each note has its own 600 ms timer, so typing in one note never cancels another note's save.
  // `unsaved` holds what was typed but isn't in the database yet: a reload from the database
  // (the watcher fires on every write, e.g. when you switch notes) must not throw it away.
  private saveTimers = new Map<number | 'new', { note: Note; timer: any }>();
  private saving = new Map<number | 'new', Promise<unknown>>();
  private lastSaved = new Map<number, string>();
  private unsaved = new Map<number, Note>();

  private saveKey(note: Note): number | 'new' {
    return note.id != null ? note.id : 'new';
  }

  // Public method components can call to trigger a debounced auto-save
  triggerAutoSave(note: Note) {
    this.lastLocalEdit = Date.now();

    // Update cache immediately for real-time UI updates
    if (note.id !== undefined && note.id !== null) {
      this.unsaved.set(note.id, { ...note });
      const idx = this.notesCache.findIndex(n => n.id === note.id);
      if (idx !== -1) {
        this.notesCache[idx] = { ...this.notesCache[idx], ...note };
      }
    }
    // (a new note has no id yet: the first save creates it and sets the id)
    this.emitNotes();

    const key = this.saveKey(note);
    clearTimeout(this.saveTimers.get(key)?.timer);
    this.saveTimers.set(key, { note, timer: setTimeout(() => void this.saveNow(key), 600) });
  }

  /** Writes every change that is still waiting for its timer (switching notes, closing the app). */
  async flushSaves(): Promise<void> {
    await Promise.all([...this.saveTimers.keys()].map(key => this.saveNow(key)));
  }

  private saveNow(key: number | 'new'): Promise<unknown> {
    const waiting = this.saveTimers.get(key);
    if (!waiting) return this.saving.get(key) ?? Promise.resolve();
    clearTimeout(waiting.timer);
    this.saveTimers.delete(key);
    // one save per note at a time, in order (a new note: the later saves update what the first created)
    const run = (this.saving.get(key) ?? Promise.resolve()).then(() => this.write(waiting.note));
    this.saving.set(key, run);
    void run.finally(() => { if (this.saving.get(key) === run) this.saving.delete(key); });
    return run;
  }

  private async write(note: Note) {
    const snapshot = { ...note };
    const sig = JSON.stringify({ title: note.title, content: note.content, categoryID: note.categoryID, folderID: note.folderID });
    if (note.id != null && this.lastSaved.get(note.id) === sig) { this.settle(snapshot); return; }
    this.saveStatusSubject.next(SaveStatus.SAVING);
    let res: any;
    try {
      res = note.id != null ? await this.updateNote(note) : await this.createNote(note);
    } catch (err) {
      console.error('Autosave failed:', err);
      res = null;
    }
    if (res && res.ok) {
      if (note.id != null) this.lastSaved.set(note.id, sig);
      this.settle(snapshot);
      this.saveStatusSubject.next(SaveStatus.SAVED);
    } else {
      this.saveStatusSubject.next(SaveStatus.ERROR);
    }
  }

  /** The database now has this version: stop protecting it, unless something newer was typed since. */
  private settle(saved: Note) {
    if (saved.id == null) return;
    const local = this.unsaved.get(saved.id);
    if (local && local.content === saved.content && local.title === saved.title && !this.saveTimers.has(saved.id)) {
      this.unsaved.delete(saved.id);
    }
  }

  public getNotesCache(): Note[] {
    return this.notesCache.filter(n => n.id == null || !this.pendingDeletes.has(n.id));
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



  async getNotesInFolder(folderId: number) {
    const userId = this.getUserId();
    const res = await window.electronAPI.notes.getNoteInFolder(folderId, userId);
    console.log('NoteService.getNotesInFolder', folderId, res);
    return res;
  }
  async loadFolders(): Promise<Folder[]> {
    return await window.electronAPI.folder.getAllFolders(this.getUserId());
  }
  async addFolder(folder: Partial<Folder>): Promise<any> {
    return await window.electronAPI.folder.addFolder(folder);
  }
  /** Rename or recolour a folder. An empty name changes nothing. */
  async updateFolder(folder: Folder): Promise<Folder> {
    const name = (folder.name ?? '').trim();
    if (!name) return folder;
    const updated = { ...folder, name };
    await window.electronAPI.folder.updateFolder({ id: updated.id, name, colour: updated.colour });
    this.notifyFolderChanged();
    return updated;
  }
  async deleteFolder(folder: Folder | number): Promise<any> {
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
    if (loggedInUser) {
      this.checkUser(loggedInUser, loggedInUser.id);
    }
    return loggedInUser;
  }
  async createAccount(user: User): Promise<User> {
    const createdUser = await window.electronAPI.notes.createUser(user);
    console.log('createdUser', createdUser);
    if (createdUser) {
      this.checkUser(createdUser, createdUser.id);
    }
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

  //#region Calendar
  public async getAllEvents(userId: number) {
    return await window.electronAPI.calendar.getAllEvents(userId);
  }
  public async createEvent(event: any) {
    return await window.electronAPI.calendar.createEvent(event);
  }
  public async updateEvent(event: any,) {
    return await window.electronAPI.calendar.updateEvent(event);
  }
  public async deleteEvent(eventId: number) {
    return await window.electronAPI.calendar.deleteEvent(eventId);
  }
  //#endregion Calendar
}
