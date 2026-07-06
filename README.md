# Nexus

A personal CRM for people who take relationships seriously. Built with Electron, React, and SQLite — all your data stays local on your machine. Free forever, unlimited contacts.

![Nexus Screenshot](resources/screenshot.png)

## Download

Grab the latest installer from [GitHub Releases](https://github.com/danieljpuusitalo/nexus/releases).

- **Windows** — `.exe` installer (NSIS)
- **macOS** — `.dmg` disk image

> Windows SmartScreen may warn on first install (we don't have a code signing certificate yet). Click "More info" then "Run anyway."

## Features

### Core CRM
- **Contact Management** — Add, edit, search, filter, and organize contacts with tags, groups, and custom fields
- **Interaction Tracking** — Log meetings, calls, emails, coffee chats, and more with a timestamped timeline and attachments
- **Smart Reminders** — One-time or recurring reminders (weekly, monthly, quarterly) with overdue alerts and dashboard widget
- **Keep In Touch** — Set contact frequency (weekly, biweekly, monthly, etc.) with list and board views, overdue indicators, and group filtering
- **Pipeline** — Kanban-style relationship pipeline with customizable stages
- **Groups & Tags** — Color-coded organization with filtering and multi-tag search
- **Favorites & Saved Views** — Pin contacts, groups, and custom filters to the sidebar for quick access
- **Contact Photos** — Profile pictures stored locally with inline editing

### Intelligence
- **AI Copilot** — Chat with your network data using your own Anthropic API key (BYOK). Ask "Who should I reconnect with?" or generate reconnection messages. Chat history persists across sessions
- **Pre-Meeting Briefing** — Automatic desktop notifications before calendar meetings with contact context, last interaction, and notes
- **Relationship Health** — Visual health indicators (green/yellow/orange/red dots) based on interaction recency
- **Merge & Fix** — Duplicate contact detection with one-click merge

### Integrations
- **Google** — OAuth sign-in, Calendar sync, Gmail metadata sync, Google Contacts import
- **Microsoft / Outlook** — OAuth sign-in, Calendar sync, Email metadata sync, Outlook Contacts import
- **Chrome Extension** — Save LinkedIn profiles to Nexus with one click, job change detection, notes, and reminders from the browser
- **Cloud Sync** — Optional Supabase-backed sync across devices (your data, your database)

### Import & Export
- **Import** — LinkedIn CSV, Dex, Clay, Google Contacts, and generic CSV with auto-detect column mapping
- **Export** — Basic CSV, Full CSV, Full JSON, and SQLite database backup
- **Interactions Import** — Import interaction history from CSV alongside contacts

### Visualization
- **Dashboard** — Stats, due-today reminders, recent activity feed, birthday widget, and onboarding checklist
- **Map View** — Leaflet-powered map with geocoded contact locations
- **Radar** — D3 visualization showing contact recency in concentric rings
- **Network Graph** — D3 relationship web with drag-to-link

### Polish
- **Dark & Light Themes** — System-aware with manual toggle
- **Command Palette** — Ctrl+K to search contacts, navigate pages, and run actions
- **Keyboard Shortcuts** — Navigate, triage, and manage contacts without touching the mouse
- **Onboarding** — Welcome screen with guided setup, 15-step interactive checklist
- **Referral Program** — Share via Twitter, LinkedIn, Facebook, or email
- **Auto-Updater** — Checks for new releases automatically via GitHub

## Tech Stack

- **Electron 40** — Cross-platform desktop shell
- **React 18** — UI framework with TypeScript 5.7
- **SQLite** (better-sqlite3) — Local database with WAL mode
- **Tailwind CSS 3** — Utility-first styling
- **D3.js** — Data visualizations (Radar, Network Graph)
- **Leaflet** — Interactive map
- **React Router 6** — Client-side routing (19+ routes)
- **electron-vite** — Build tooling
- **electron-builder** — Packaging and distribution
- **electron-updater** — Auto-updates from GitHub Releases

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Install

```bash
git clone https://github.com/danieljpuusitalo/nexus.git
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

The packaged app will be in the `release/` directory. See [RELEASE.md](RELEASE.md) for the full release process including GitHub Actions CI/CD.

## Project Structure

```
src/
  main/              # Electron main process
    index.ts         # Window creation, app lifecycle, auto-updater
    database.ts      # SQLite schema, migrations, 18+ tables
    ipc.ts           # IPC handlers (85+ endpoints)
    google-auth.ts   # Google OAuth + token refresh
    microsoft-auth.ts # Microsoft OAuth + token refresh
    meeting-briefing.ts # Pre-meeting notification loop
  preload/           # Context bridge
    index.ts         # Secure API exposure
  renderer/          # React frontend
    src/
      pages/         # 19+ pages (Dashboard, Contacts, Pipeline, Copilot, etc.)
      components/    # Layout, UI primitives, ErrorBoundary, EmptyState
      types/         # TypeScript interfaces
extension/           # Chrome extension (Manifest V3)
landing/             # Marketing site (index.html, privacy, terms, SEO pages)
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | Quick add contact |
| `Ctrl+K` | Command palette / search |
| `Ctrl+/` | Show shortcuts help |
| `Esc` | Close modal / go back |
| `1-8` | Navigate between pages |
| `Space` | Skip (Quick Action triage) |
| `Z` | Undo (Quick Action triage) |

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a Pull Request

## License

[MIT](LICENSE)
