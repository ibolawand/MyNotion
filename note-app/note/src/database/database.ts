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

        await this.dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                categoryID INTEGER NOT NULL,
                userID INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(categoryID) REFERENCES CATEGORIES,
                FOREIGN KEY(userID) REFERENCES USERS
            );
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                userID INTEGER NOT NULL,
                FOREIGN KEY(userID) REFERENCES USERS
            );
            CREATE TABLE IF NOT EXISTS FOLDERS(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                colour TEXT DEFAULT '#4ade80',
                categoryID INTEGER,
                userID INTEGER NOT NULL,
                notesID INTEGER,
                FOREIGN KEY(categoryID) REFERENCES CATEGORIES(id) ON DELETE CASCADE,
                FOREIGN KEY(notesID) REFERENCES  notes(id) ON DELETE CASCADE,
                FOREIGN KEY(userID) REFERENCES USERS
            );  
            CREATE TABLE IF NOT EXISTS USERS(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT NOT NULL,
                password TEXT NOT NULL,
                logged_in BOOLEAN DEFAULT 0
            );
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