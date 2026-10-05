DROP TABLE notes;
DROP TABLE categories;
DROP TABLE FOLDERS;
CREATE TABLE IF NOT EXISTS notes (
                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                     categoryID INTEGER NOT NULL,
                                     folderID INTEGER,
                                     title TEXT NOT NULL,
                                     content TEXT,
                                     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                     FOREIGN KEY(categoryID) REFERENCES CATEGORIES,
                                     FOREIGN KEY(folderID) REFERENCES FOLDERS(id)


);

CREATE TABLE IF NOT EXISTS categories (
                                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                                          category TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS FOLDERS(
                                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                                      name TEXT NOT NULL,
                                      colour TEXT DEFAULT '#4ade80'
);

INSERT INTO FOLDERS (name, colour) VALUES ('Others','#4ade80')