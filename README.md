# Nexus

A personal CRM desktop app for managing professional and personal relationships. Built with Electron, React, and SQLite — all data stays local on your machine.

![Nexus Screenshot](resources/screenshot.png)

## Features

- **Contact Management** — Add, edit, search, filter, and organize contacts with tags and groups
- **Interaction Tracking** — Log meetings, calls, emails, coffee chats, and more with a timestamped timeline
- **Smart Reminders** — Set one-time or recurring reminders (weekly, monthly, quarterly) with overdue alerts
- **Groups & Tags** — Color-coded organization with filtering and multi-tag search
- **Import/Export** — CSV import with column mapping, LinkedIn import, filtered export, and full database backup
- **Dashboard** — At-a-glance stats, due-today reminders, and recently contacted lists
- **Keyboard Shortcuts** — Ctrl+N, Ctrl+K, number-key navigation, and more
- **100% Local** — No accounts, no cloud, no tracking. Your data stays on your machine in a SQLite database

## Tech Stack

- **Electron** — Cross-platform desktop shell
- **React 18** — UI framework with TypeScript
- **SQLite** (better-sqlite3) — Local database with WAL mode
- **Tailwind CSS** — Utility-first styling
- **electron-vite** — Build tooling
- **electron-builder** — Packaging and distribution

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Install

```bash
git clone https://github.com/YOUR_USERNAME/nexus.git
cd nexus
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build        # Compile for production
npm run package      # Build Windows installer (.exe)
```

The packaged app will be in the `release/` directory.

## Project Structure

```
src/
  main/           # Electron main process
    index.ts      # Window creation, app lifecycle
    database.ts   # SQLite schema and migrations
    ipc.ts        # IPC handlers (40+ endpoints)
  preload/        # Context bridge
    index.ts      # Secure API exposure
  renderer/       # React frontend
    src/
      pages/      # Dashboard, Contacts, Groups, Tags, etc.
      components/ # Layout (Sidebar, AppLayout) and UI (SlideOver, TagInput)
      types/      # TypeScript interfaces
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | Quick add contact |
| `Ctrl+K` | Search contacts |
| `Ctrl+/` | Show shortcuts help |
| `Esc` | Close modal / go back |
| `1-7` | Navigate between pages |

## Roadmap

- [ ] Contact photo uploads
- [ ] Dark/light theme toggle
- [ ] Full-text search across notes and interactions
- [ ] Recurring interaction reminders
- [ ] macOS and Linux builds
- [ ] Data sync (optional, encrypted)

## License

[MIT](LICENSE)
