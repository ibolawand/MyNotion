import { BrowserWindow, ipcMain, safeStorage } from 'electron';
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

    const saveToken = (token: string) => {
        if (!isEncryptionEnabled) {
            store.set('auth_token', token);
            return;
        }

        const encrypted = safeStorage.encryptString(token).toString('base64');
        store.set('auth_token', encrypted);
    };

    const getToken = (): string | null => {
        const stored = store.get('auth_token');
        if (!stored) return null;
        if (!isEncryptionEnabled) return stored;
        try {
            return safeStorage.decryptString(Buffer.from(stored, 'base64'));
        } catch (error) {
            // Tokens written by older builds were stored as plaintext.
            return stored;
        }
    };

    const removeToken = () => {
        store.delete('auth_token');
    };

    ipcMain.handle('save-token', (_event, token: string) => {
        saveToken(token);
    });

    ipcMain.handle('get-token', () => {
        return getToken();
    });

    ipcMain.handle('remove-token', () => {
        removeToken();
    });
    //#region users
    ipcMain.handle('createUser', async (event, user: User) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`SELECT id FROM users WHERE username = ? OR email = ?`);
            const existing = await stmt.get(user.username, user.email);
            await stmt.finalize();
            if (existing) {
                return { ok: false, error: 'user already exists' };
            }

            const insert = await db.prepare(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`);
            await insert.run(user.username, user.email, user.password);
            await insert.finalize();

            const select = await db.prepare(`SELECT * FROM users WHERE username = ? AND email = ?`);
            const result = await select.get(user.username, user.email) as User;
            await select.finalize();

            // A newly created account is effectively logged in.
            saveToken(crypto.randomBytes(32).toString('hex'));
            return result;
        } catch (err) {
            console.error('createUser error:', err);
            return { ok: false, error: String(err) };
        }
    })
    ipcMain.handle('login', async (event, user: User) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`SELECT * FROM users WHERE username = ? AND password = ?`);
            const result = await stmt.get(user.username, user.password);
            await stmt.finalize();

            if (result) {
                saveToken(crypto.randomBytes(32).toString('hex'));
                const update = await db.prepare(`UPDATE users SET logged_in = 1 WHERE id = ?`);
                await update.run(result.id);
                await update.finalize();
                return result;
            }
            return null;
        } catch (err) {
            console.error('login error:', err);
            return null;
        }
    })
    ipcMain.handle('logout', async (event, user: User) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`UPDATE users SET logged_in = 0 WHERE id = ?`);
            await stmt.run(user.id);
            await stmt.finalize();
            removeToken();
        } catch (err) {
            console.error('logout error:', err);
        }
    })
    //#endregion
    //#region notes
    ipcMain.handle('create:note', async (event, data: any) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`INSERT INTO notes (title, content, categoryID, folderID, userID)
                                           VALUES (?, ?, ?, ?, ?)`);
            const res = await stmt.run(data.title, data.content, data.categoryID, data.folderID ?? 0, data.userID);
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
                                           SET title = ?, content = ?, categoryID = ?, folderID = ?, updated_at = CURRENT_TIMESTAMP
                                           WHERE id = ?`);
            await stmt.run(data.title, data.content, data.categoryID, data.folderID ?? 0, data.id);
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
            await db.exec('BEGIN');
            try {
                let stmt = await db.prepare(`DELETE FROM notes WHERE categoryID = ?;`);
                await stmt.run(categoryID);
                await stmt.finalize();
                stmt = await db.prepare(`DELETE FROM categories WHERE id = ?;`);
                await stmt.run(categoryID);
                await stmt.finalize();
                await db.exec('COMMIT');
                return { ok: true };
            } catch (err) {
                await db.exec('ROLLBACK');
                throw err;
            }
        } catch (err) {
            console.error('deleteCategory error:', err);
            return { ok: false, error: String(err) };
        }
    });
    //#endregion
    ipcMain.handle('addFolder', async (event, folder: Folder) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`INSERT INTO FOLDERS (name, colour, userID, parentID) VALUES (?, ?, ?, ?)`);
            const res = await stmt.run(
                folder.name,
                folder.colour || '#4ade80',
                folder.userID || 0,
                folder.parentID ?? null
            );
            await stmt.finalize();
            return { ok: true, id: res?.lastID };
        } catch (err) {
            console.error('createFolder error:', err);
            return { ok: false, error: String(err) };
        }
    });

    ipcMain.handle('getAllFolders', async (event, userId?: number) => {
        try {
            const db = await DB.getConnection();
            let result: Folder[];
            if (userId && userId > 0) {
                const stmt = await db.prepare(`SELECT * FROM FOLDERS WHERE userID = ? OR userID = 0 ORDER BY id ASC`);
                result = await stmt.all(userId);
                await stmt.finalize();
            } else {
                const stmt = await db.prepare(`SELECT * FROM FOLDERS ORDER BY id ASC`);
                result = await stmt.all();
                await stmt.finalize();
            }
            return result || [];
        } catch (err) {
            console.error('getAllFolders error:', err);
            return [];
        }
    });

    ipcMain.handle('getNoteInFolder', async (event, folderId: number, userId?: number) => {
        try {
            const db = await DB.getConnection();
            let result: Note[];
            if (userId && userId > 0) {
                const stmt = await db.prepare(`SELECT * FROM notes WHERE folderID = ? AND userID = ? ORDER BY created_at DESC`);
                result = await stmt.all(folderId, userId);
                await stmt.finalize();
            } else {
                const stmt = await db.prepare(`SELECT * FROM notes WHERE folderID = ? ORDER BY created_at DESC`);
                result = await stmt.all(folderId);
                await stmt.finalize();
            }
            return result || [];
        } catch (err) {
            console.error('getNoteInFolder error:', err);
            return [];
        }
    });

    ipcMain.handle('deleteFolder', async (event, folder: Folder | number) => {
        try {
            const folderId = typeof folder === 'number' ? folder : folder?.id;
            if (!folderId) {
                return { ok: false, error: 'Invalid folder ID' };
            }
            const db = await DB.getConnection();
            await db.exec('BEGIN');
            try {
                // Recursively collect all descendant folder IDs
                const allFolderIds: number[] = [folderId];
                const collectDescendants = async (parentId: number) => {
                    const children = await db.all(`SELECT id FROM FOLDERS WHERE parentID = ?`, [parentId]);
                    for (const child of children) {
                        allFolderIds.push(child.id);
                        await collectDescendants(child.id);
                    }
                };
                await collectDescendants(folderId);

                const placeholders = allFolderIds.map(() => '?').join(',');
                // Delete notes belonging to these folders
                await db.run(`DELETE FROM notes WHERE folderID IN (${placeholders})`, allFolderIds);
                // Delete the folders themselves
                await db.run(`DELETE FROM FOLDERS WHERE id IN (${placeholders})`, allFolderIds);

                await db.exec('COMMIT');
                return { ok: true, deletedFolderIds: allFolderIds };
            } catch (err) {
                await db.exec('ROLLBACK');
                throw err;
            }
        } catch (e) {
            console.error('deleteFolder error:', e);
            return { ok: false, error: String(e) };
        }
    });
    //#endregion folders
    // #region calendar
    ipcMain.handle('getAllEvents', async (event, userId: number) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`SELECT * FROM EVENTS WHERE userID = ? ORDER BY date ASC, startHour ASC`);
            const result = await stmt.all(userId);
            await stmt.finalize();
            console.log('getAllEvents result:', result);
            return result;
        } catch (err) {
            console.error('getAllEvents error:', err);
            return [];
        }
    });

    ipcMain.handle('createEvent', async (event, eventData: CalendarEvent ) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`INSERT INTO EVENTS (date, startHour, duration, title, color, allDay, userID)
                                           VALUES (?, ?, ?, ?, ?, ?, ?)`);
            const res = await stmt.run(eventData.date, eventData.startHour || null, eventData.duration || null, eventData.title, eventData.color, eventData.allDay, eventData.userID);
            await stmt.finalize();
            return { ok: true, id: res?.lastID };
        } catch (err) {
            console.error('createEvent error:', err);
            return { ok: false, error: String(err) };
        }
    });
  
    ipcMain.handle('updateEvent', async (event, eventData: CalendarEvent ) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`UPDATE EVENTS
                                           SET date = ?, startHour = ?, duration = ?, title = ?, color = ?, allDay = ?
                                           WHERE id = ?`);
            await stmt.run(eventData.date, eventData.startHour || null, eventData.duration || null, eventData.title, eventData.color, eventData.id);
            await stmt.finalize();
            return { ok: true };
        } catch (err) {
            console.error('updateEvent error:', err);
            return { ok: false, error: String(err) };
        }
    });

    ipcMain.handle('deleteEvent', async (event, eventId: number) => {
        try {
            const db = await DB.getConnection();
            const stmt = await db.prepare(`DELETE FROM EVENTS WHERE id = ?`);
            await stmt.run(eventId);
            await stmt.finalize();
            return { ok: true };
        } catch (err) {
            console.error('deleteEvent error:', err);
            return { ok: false, error: String(err) };
        }
    });
    // #endregion calendar

}