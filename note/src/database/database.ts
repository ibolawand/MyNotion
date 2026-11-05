import sqlite3 from 'sqlite3'
import { Database, open } from 'sqlite';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export class DB {
    private static DB_NAME = 'noted.db';
    private static dbInstance: Database | null = null;

    /**
     * One fixed place for the data, no matter how the app is started (menu, Aria, `npm start`):
     * $MYNOTION_DB if set, otherwise ~/.config/MyNotion/noted.db. (It used to be ./noted.db, which
     * depends on the folder the app happens to start in, so an installed app would see an empty DB.)
     */
    public static get filePath(): string {
        return process.env.MYNOTION_DB || path.join(app.getPath('userData'), this.DB_NAME);
    }

    /** First run with the fixed location: bring over the database from the old ./noted.db. */
    private static migrateOldLocation(target: string) {
        if (fs.existsSync(target)) return;
        const legacy = path.resolve(this.DB_NAME);
        if (legacy !== target && fs.existsSync(legacy)) {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(legacy, target);
            console.log(`Copied database from ${legacy} to ${target}`);
        }
    }

    public static async createConnection() {
        try {
            const file = this.filePath;
            this.migrateOldLocation(file);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            this.dbInstance = await open({
                filename: file,
                driver: sqlite3.Database,
            });
            await this.dbInstance.exec('PRAGMA foreign_keys = ON;');
            return this.dbInstance;
        } catch (err: any) {
            console.error('Failed to open database:', err);
            throw err;
        }
    }

    public static async initializeTables() {
        if (!this.dbInstance) return;

        // Schema matches what the IPC handlers actually read/write.
        // No FOREIGN KEY clauses: SQLite does not enforce them unless
        // `PRAGMA foreign_keys` is enabled, and the app uses `categoryID = 0`
        // as the "uncategorised" sentinel, so referential integrity is handled
        // in code instead (see deleteCategory).
        await this.dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                categoryID INTEGER NOT NULL DEFAULT 0,
                folderID INTEGER NOT NULL DEFAULT 0,
                userID INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                userID INTEGER NOT NULL
            );
           CREATE TABLE IF NOT EXISTS FOLDERS (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                colour TEXT DEFAULT '#4ade80',
                parentID INTEGER DEFAULT NULL REFERENCES FOLDERS(id) ON DELETE CASCADE,
                userID INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS USERS (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT NOT NULL,
                password TEXT NOT NULL,
                logged_in BOOLEAN DEFAULT 0
            );
            CREATE TABlE IF NOT EXISTS EVENTS (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                startHour REAL,
                duration REAL,
                title TEXT NOT NULL,
                color TEXT,
                allDay BOOLEAN DEFAULT 0,
                userID INTEGER NOT NULL,
                repeat TEXT DEFAULT NULL
            );

        `);

        await this.migrateLegacySchema();
        await this.addColumnIfMissing('EVENTS', 'repeat', 'TEXT DEFAULT NULL');  // daily|weekly|monthly|yearly
    }

    private static async addColumnIfMissing(table: string, column: string, type: string) {
        const db = this.dbInstance;
        if (!db) return;
        try {
            const cols = await db.all(`PRAGMA table_info(${table})`);
            if (cols.length && !cols.some((c: any) => c.name === column)) {
                await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
            }
        } catch (err) {
            console.error(`addColumnIfMissing ${table}.${column} error:`, err);
        }
    }

    // Ensure FOLDERS table has all required columns (parentID, userID, colour)
    private static async migrateLegacySchema() {
        const db = this.dbInstance;
        if (!db) return;

        try {
            const folderCols = await db.all(`PRAGMA table_info(FOLDERS)`);
            if (!folderCols || folderCols.length === 0) return;

            const hasParentID = folderCols.some((c: any) => c.name === 'parentID');
            const hasUserID = folderCols.some((c: any) => c.name === 'userID');
            const hasColour = folderCols.some((c: any) => c.name === 'colour');
            const hasLegacyDesc = folderCols.some((c: any) => c.name === 'description');

            if (!hasParentID) {
                await db.exec(`ALTER TABLE FOLDERS ADD COLUMN parentID INTEGER DEFAULT NULL REFERENCES FOLDERS(id) ON DELETE CASCADE;`);
            }
            if (!hasUserID) {
                await db.exec(`ALTER TABLE FOLDERS ADD COLUMN userID INTEGER NOT NULL DEFAULT 0;`);
            }
            if (!hasColour) {
                await db.exec(`ALTER TABLE FOLDERS ADD COLUMN colour TEXT DEFAULT '#4ade80';`);
            }

            if (hasLegacyDesc) {
                const row = await db.get(`SELECT COUNT(*) AS n FROM FOLDERS`) as { n: number };
                if (row && row.n === 0) {
                    await db.exec(`
                        DROP TABLE FOLDERS;
                        CREATE TABLE IF NOT EXISTS FOLDERS (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            colour TEXT DEFAULT '#4ade80',
                            parentID INTEGER DEFAULT NULL REFERENCES FOLDERS(id) ON DELETE CASCADE,
                            userID INTEGER NOT NULL DEFAULT 0
                        );
                    `);
                }
            }
        } catch (err) {
            console.error('migrateLegacySchema error:', err);
        }
    }
    public static async dropTables() {
        if (!this.dbInstance) return;
        await this.dbInstance.exec(`
            DROP TABLE IF EXISTS notes;
            DROP TABLE IF EXISTS categories;
            DROP TABLE IF EXISTS FOLDERS;
            DROP TABLE IF EXISTS USERS;
            DROP TABLE IF EXISTS EVENTS;
        `);
    }

    /**
     * Daily backup: ~/.config/MyNotion/backups/noted-YYYY-MM-DD.db, keeping the newest BACKUPS_KEPT.
     * VACUUM INTO writes a consistent copy even while the app (or Aria) is using the database.
     * Safe to call often: it only does work when today's backup doesn't exist yet.
     */
    public static readonly BACKUPS_KEPT = 14;

    public static get backupDir(): string {
        return path.join(path.dirname(this.filePath), 'backups');
    }

    public static async backupDaily(): Promise<string | null> {
        try {
            const db = await this.getConnection();
            const dir = this.backupDir;
            fs.mkdirSync(dir, { recursive: true });
            const d = new Date();
            const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const target = path.join(dir, `noted-${day}.db`);
            if (fs.existsSync(target)) return null;

            await db.run('VACUUM INTO ?', [target]);

            const old = fs.readdirSync(dir)
                .filter(f => /^noted-\d{4}-\d{2}-\d{2}\.db$/.test(f))
                .sort()
                .reverse()
                .slice(this.BACKUPS_KEPT);
            for (const f of old) fs.unlinkSync(path.join(dir, f));
            console.log(`Backup written: ${target}`);
            return target;
        } catch (err) {
            console.error('Backup failed:', err);
            return null;
        }
    }

    public static async getConnection() {
        if (!this.dbInstance) await this.createConnection();
        return this.dbInstance!;
    }
    public static async closeConnection() {
        if (this.dbInstance) {
            await this.dbInstance.close();
            this.dbInstance = null;
        }
    }
}