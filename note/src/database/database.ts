import sqlite3 from 'sqlite3'
import { Database, open } from 'sqlite';

export class DB {
    private static DB_NAME = 'noted';
    private static dbInstance: Database | null = null;
    public static async createConnection() {
        try {
            this.dbInstance = await open({
                filename: `./${this.DB_NAME}`,
                driver: sqlite3.Database,
            });
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
                colour TEXT DEFAULT '#4ade80'
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
                userID INTEGER NOT NULL
            );
         
        `);

        await this.migrateLegacySchema();
    }

    // Older builds created FOLDERS with `description` and `userID` NOT NULL
    // columns that the app never writes, which made every addFolder INSERT
    // fail. Rebuild the table if it still has that shape and is empty.
    private static async migrateLegacySchema() {
        const db = this.dbInstance;
        if (!db) return;

        const folderCols = await db.all(`PRAGMA table_info(FOLDERS)`);
        const hasLegacyFolders = folderCols.some((c: any) => c.name === 'description');
        if (!hasLegacyFolders) return;

        const row = await db.get(`SELECT COUNT(*) AS n FROM FOLDERS`) as { n: number };
        if (row.n === 0) {
            await db.exec(`
                DROP TABLE FOLDERS;
                CREATE TABLE IF NOT EXISTS FOLDERS (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    colour TEXT DEFAULT '#4ade80'
                );
            `);
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