import { BrowserWindow, ipcMain, ipcRenderer, safeStorage } from 'electron';
import { DB } from './database/database';
import Store from 'electron-store';
import crypto from 'crypto';

type Storetype = {
    auth_token: string;
}
const store = new Store<Storetype>({
    defaults: {
        auth_token: ''
    }
});



export function setUpHandlers() {
    ipcMain.handle('close-window', () => {
        const window = BrowserWindow.getFocusedWindow();
        if (window) {
            window.close();
        }
    })

    ipcMain.handle('minimize-window', () => {
        const window = BrowserWindow.getFocusedWindow();
        if (window) {
            window.minimize();
        }
    })

    ipcMain.handle('maximize-window', () => {
        const window = BrowserWindow.getFocusedWindow();
        if (window) {
            if (window.isMaximized()) {
                window.unmaximize();
            } else {
                window.maximize();
            }
        }
    })

    const isEncryptionEnabled = safeStorage.isEncryptionAvailable();

    ipcMain.handle('save-token', (_event, token: string) => {
        if (!isEncryptionEnabled) {
            store.set('auth_token', token);
            return;
        }

        const encrypted = safeStorage.encryptString(token).toString('base64');
        store.set('auth_token', encrypted);
    });

    ipcMain.handle('get-token', (event) => {
        const encrypted = store.get('auth_token')
        if (!encrypted) return null
        try {
            return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
        } catch (error) {
            console.error('get-token error:', error);
            return null
        }
    })
    ipcMain.handle('removeToken', () => {
        store.delete('auth_token');
    })
    //#region users
    ipcMain.handle('createUser', async (event, user: User) => {
        try {
            const db = await DB.getConnection();
            let stmt = await db.prepare(`SElECT username,email FROM users where username=? and email=?`)
            const us = await stmt.get<User>(user.username, user.email)
            if (us?.username == user.username && us?.email == user.email) {
                return { ok: false, error: "user already exists" }
            }
            await stmt.finalize();
            stmt = await db.prepare(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`);
            await stmt.run(user.username, user.email, user.password);
            await stmt.finalize();
            stmt = await db.prepare(`SELECT * FROM users WHERE username = ? AND email = ?`);
            const result = await stmt.get(user.username, user.email) as User;
            await stmt.finalize();
            return result;
        } catch (err) {
            console.error('createUser error:', err);
            return null;
        }
    })
    ipcMain.handle('login', async (event, user: User) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`SELECT * FROM users WHERE username = ? AND password = ?`);
            const result = await stmt.get(user.username, user.password);
            if (result) {
                const randomToken = crypto.randomBytes(32).toString('hex');
                store.set('auth_token', randomToken);
            }
            await stmt.finalize();
            return result;
        } catch (err) {
            console.error('login error:', err);
        }
    })
    ipcMain.handle('logout', async (event, user: User) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`UPDATE users SET logged_in = 0 WHERE id = ?`);
            await stmt.run(user.id);
            await stmt.finalize();
        } catch (err) {
            console.error('logout error:', err);
        }
    })
    //#endregion
    //#region notes
    ipcMain.handle('create:note', async (event, data: any) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`INSERT INTO notes (title, content, categoryID, userID)
                                           VALUES (?, ?, ?, ?)`);
            const res = await stmt.run(data.title, data.content, data.categoryID, data.userID);
            await stmt.finalize();
            const id = res?.lastID;
            return { ok: true, id };
        } catch (err) {
            console.error('create:note error:', err);
            return { ok: false, error: String(err) };
        }
    });
    ipcMain.handle('delete:note', async (event, id: number) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`DELETE FROM notes WHERE id = ?`);
            await stmt.run(id);
            await stmt.finalize();
            return { ok: true };
        } catch (err) {
            console.error('delete:note error:', err);
        }
    })

    ipcMain.handle('update:note', async (event, data: any) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`UPDATE notes
                                           SET title = ?, content = ?, categoryID = ?, updated_at = CURRENT_TIMESTAMP
                                           WHERE id = ?`);
            await stmt.run(data.title, data.content, data.categoryID, data.id);
            await stmt.finalize();
            return { ok: true };
        } catch (err) {
            console.error('update:note error:', err);
            return { ok: false, error: String(err) };
        }
    });
    ipcMain.handle('getAllNotes', async (event,userId:number) => {
        try {
            const db = await DB.getConnection();
            const rows:Note[] = await db.all(`SELECT *
                                       FROM notes where userID=?
                                       ORDER BY created_at DESC`,[userId]);
            return rows;
        } catch (err) {
            console.error('getAllNotes error:', err);
            return [];
        }
    });
    //#endregion notes
    //#region categories
    ipcMain.handle('getCategories', async (event, userId: number) => {
        try {
            const db = await DB.getConnection();
            const validUserId = userId || 0;
            const rows = await db.prepare(`SELECT id, category FROM categories where userID = ? ORDER BY category ASC`);
            const result = await rows.all(validUserId)
            await rows.finalize();
            return (result || []).map((r: any) => ({ id: r.id, name: r.category }));
        } catch (err) {
            console.error('getCategories error:', err);
            return [];
        }
    });

    ipcMain.handle('getNoteWithCertainCategory', async (event, categoryID: number, userId: number) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`SELECT *
                                           FROM notes
                                           WHERE categoryID = ? AND userID = ?;`);
            const result = await stmt.all(categoryID, userId);
            await stmt.finalize();
            return result;
        } catch (err) {
            console.error('getNoteWithCertainCategory error:', err);
            return [];
        }
    });

    ipcMain.handle('createCategory', async (event, categoryInput: Category) => {
        try {
            const db = await DB.getConnection();
            const name: string = typeof categoryInput === 'string' ? categoryInput : categoryInput?.name;

            if (!name || typeof name !== 'string') {
                throw new Error('Invalid category name');
            }
            const validUserId = categoryInput.userID || 0;
            let stmt = await db.prepare(`SELECT id, category FROM categories WHERE category = ? AND userID = ?`);
            const existing = await stmt.get(name, validUserId);
            await stmt.finalize();
            if (existing) {
                return { id: existing.id, name: existing.category };
            }
            stmt = await db.prepare(`INSERT INTO categories (category,userID) VALUES (?,?)`);
            const res = await stmt.run(name, validUserId);
            await stmt.finalize();
            const id = res?.lastID;
            return { id, name };
        } catch (err) {
            console.error('createCategory error:', err);
            return { error: String(err) };
        }
    });
    ipcMain.handle('deleteCategory', async (event, categoryID: number) => {
        try {
            const db = await DB.getConnection();

            let stmt = await db.prepare(`DELETE FROM categories WHERE id = ?;`);
            await stmt.run(categoryID);
            await stmt.finalize();
            stmt = await db.prepare(`DELETE FROM notes WHERE categoryID = ?;`);
            await stmt.run(categoryID);
            await stmt.finalize();
        } catch (err) {
            console.error('deleteCategory error:', err);
        }
    });
    //#endregion
    ipcMain.handle('addFolder', async (event, folder: Folder) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`INSERT INTO FOLDERS (name,colour) VALUES(?,?)`)
            await stmt.run(folder.name, folder.colour);
            await stmt.finalize();
        } catch (err) {
            console.error('createFolder error:', err);
        }
    })
    ipcMain.handle('getAllFolders', async (event) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`SELECT * FROM Folders`)
            const result: Folder[] = await stmt.all();
            await stmt.finalize();
            return result;
        } catch (err) {
            console.error('getAllFolders error:', err);
        }
    })
    ipcMain.handle('deleteFolder', async (event, folder: Folder) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`DELETE FROM FOLDERS WHERE id = ?;`);
            await stmt.run(folder.id);
            await stmt.finalize();
        } catch (e) {
            console.error('deleteFolder error:', e);
        }
    })
    //#endregion folders

}