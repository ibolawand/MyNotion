# MyNotion

MyNotion is a local-first desktop note-taking workspace inspired by tools like Notion and Obsidian. It combines a desktop shell, a rich note editor, personal organization tools, and a lightweight productivity dashboard into one app.

The project is split into:
- a desktop Electron application in `note-app/note`
- an Angular frontend in `note-app/note-frontend`
- a local SQLite database for persistence

## Project overview

MyNotion is designed for managing personal notes, organizing them into categories and folders, and keeping task-like planning in one place. Users can create accounts, log in locally, write notes, and browse notes by category. The app also includes a calendar view, a dashboard-style overview, and a small assistant/chat panel.

## Core features

- User authentication and session handling
- Note creation, editing, deletion, and listing
- Category-based note organization
- Folder grouping for note collections
- Rich text editing with Tiptap
- Calendar and event-oriented UI
- Desktop window controls (minimize, maximize, close)
- Local persisted data with SQLite
- Electron-based desktop experience with Angular frontend

## Tech stack

- Electron + TypeScript
- Angular 20
- SQLite via `sqlite` and `sqlite3`
- Tiptap for rich text editing
- RxJS for frontend state management
- Electron Store for local token storage

## Repository structure

```text
.
├── README.md
├── note-app/
│   ├── note/
│   │   ├── src/
│   │   ├── package.json
│   │   ├── forge.config.ts
│   │   └── webpack.*.ts
│   └── note-frontend/
│       ├── src/
│       ├── package.json
│       ├── angular.json
│       └── tsconfig*.json
└── ...
```

### Main backend app

The Electron app under `note-app/note` handles:
- app lifecycle and window management
- IPC handlers for notes, categories, folders, and users
- SQLite access and initialization
- secure local token storage

### Frontend app

The Angular app under `note-app/note-frontend` handles:
- login and account creation screens
- note overview and editor UI
- side navigation and dashboard views
- calendar/event components
- chat assistant widget

## Database

The app initializes a local SQLite database named `noted` and creates tables for:
- `users`
- `notes`
- `categories`
- `folders`

The database logic is contained in `note-app/note/src/database/database.ts` and is initialized through the Electron app startup flow.

## Getting started

### Prerequisites

- Node.js 18+ or 20+
- npm

### 1. Install dependencies

From the project root, install the backend dependencies:

```bash
cd note-app/note
npm install
```

Then install the frontend dependencies:

```bash
cd ../note-frontend
npm install
```

### 2. Run the desktop app

From the Electron app directory:

```bash
cd note-app/note
npm start
```

This launches the desktop application and loads the Angular UI inside Electron.

### 3. Run the frontend separately (optional)

For frontend-only development:

```bash
cd note-app/note-frontend
npm start
```

Then open the local Angular development server in your browser.

## Useful commands

### Electron app

```bash
cd note-app/note
npm start
npm run package
npm run make
```

### Frontend app

```bash
cd note-app/note-frontend
npm start
npm run build
npm test
```

## Notes on current implementation

This project is a personal productivity app with a local-first architecture. It stores data directly on the device instead of relying on a remote backend, which makes it suitable for quick note capture and local organization.

It is best viewed as a prototype or personal workspace app, with room for extension into features such as:
- richer collaborative syncing
- cloud backup
- more advanced task management
- improved search and document tagging
- AI-powered assistant features

## License

This project currently uses the package default license for the Electron app (`MIT`), as defined in `note-app/note/package.json`.

## Summary

MyNotion is a local desktop note system with authentication, structured note organization, a rich text editor, planning/calendar features, and a polished Angular shell. It is a useful foundation for a more complete personal knowledge management application.
