# Changelog

## v1.0.0 (2026-02-26)

### Features
- **Contacts**: Full CRUD with search, multi-filter (group, tag, sort), inline edit, and CSV export
- **Contact Detail**: Rich profile view with colored avatar, inline editing, activity timeline, and quick actions
- **Groups**: Create color-coded groups, assign contacts, view members
- **Tags**: Create, rename, recolor, and delete tags with contact counts
- **Interactions**: Log meetings, calls, emails, notes, coffee, events; global timeline with type filter
- **Reminders**: Set reminders with repeat scheduling (weekly/monthly/quarterly); overdue, today, and upcoming sections
- **Dashboard**: Stats overview, due-today reminders, recently added and recently contacted lists
- **Import/Export**: CSV import with column mapping, LinkedIn import, filtered export, database backup
- **Quick Add**: Floating action button for adding contacts from any page
- **Keyboard Shortcuts**: Ctrl+N (new contact), Ctrl+K (search), Ctrl+/ (help), number keys for navigation
- **Settings**: Data stats, import/export tools, database reset with triple confirmation
- **Window State**: Remembers size and position between sessions
- **Notification Banner**: Alerts for overdue and due-today reminders
- **Sidebar Badge**: Live reminder count on navigation

### Technical
- Electron + React 18 + TypeScript
- SQLite via better-sqlite3 with WAL mode
- Tailwind CSS dark theme
- Context-isolated IPC architecture
- Schema migrations for backwards compatibility
