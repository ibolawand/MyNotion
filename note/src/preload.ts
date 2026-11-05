// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld('electronAPI', {
    window: {
        minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
        maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
        closeWindow: () => ipcRenderer.invoke('close-window'),
    },
    notes: {
        getLocalUser: () => ipcRenderer.invoke('getLocalUser'),
        createUser: (user: User) => ipcRenderer.invoke('createUser', user),
        login: (user: User) => ipcRenderer.invoke('login', user),
        logout: (user: User) => ipcRenderer.invoke('logout', user),
        getAllNotes: (userId:number) => ipcRenderer.invoke('getAllNotes',userId),
        getNoteInFolder: (folderId:number, userId:number) => ipcRenderer.invoke('getNoteInFolder',folderId,userId),
        createNote: (note: any) => ipcRenderer.invoke('create:note', note),
        updateNote: (note: any) => ipcRenderer.invoke('update:note', note),
        deleteNote: (id: number): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('delete:note', id),
        saveToken: (token: string) => ipcRenderer.invoke('save-token', token),
        getToken: () => ipcRenderer.invoke('get-token'),
        removeToken: () => ipcRenderer.invoke('remove-token'),
        getNoteWithCertainCategory: (category: number, userId: number) => ipcRenderer.invoke('getNoteWithCertainCategory', category, userId),
        getCategories: (userid:number) => ipcRenderer.invoke('getCategories',userid),
        createCategory: (category: Category | string) => ipcRenderer.invoke('createCategory', category),
        deleteCategory: (categoryid: number) => ipcRenderer.invoke('deleteCategory', categoryid),
    },
    calendar: {
        getAllEvents: (userId: number) => ipcRenderer.invoke('getAllEvents', userId),
        createEvent: (event: CalendarEvent ) => ipcRenderer.invoke('createEvent', event),
        updateEvent: (event: CalendarEvent ) => ipcRenderer.invoke('updateEvent', event),
        deleteEvent: (eventId: number) => ipcRenderer.invoke('deleteEvent', eventId),
    },
    folder: {
        addFolder: (folder: any) => ipcRenderer.invoke('addFolder', folder),
        getAllFolders: (userId?: number): Promise<Folder[]> => ipcRenderer.invoke('getAllFolders', userId),
        deleteFolder: (folder: any) => ipcRenderer.invoke('deleteFolder', folder),
    },
    // "open calendar" / "open note 12" from Aria or a second launch. takeOpenTarget() returns the
    // one given at startup (once); onOpenTarget fires for later ones.
    takeOpenTarget: (): Promise<string | null> => ipcRenderer.invoke('take-open-target'),
    onOpenTarget: (callback: (target: string) => void) => {
        const listener = (_e: unknown, target: string) => callback(target);
        ipcRenderer.on('open-target', listener);
        return () => ipcRenderer.removeListener('open-target', listener);
    },
    // Fires when the database was changed from outside (e.g. Aria added a note or event).
    // Returns an unsubscribe function.
    onDbChanged: (callback: () => void) => {
        const listener = () => callback();
        ipcRenderer.on('db-changed', listener);
        return () => ipcRenderer.removeListener('db-changed', listener);
    },
});