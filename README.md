# Wochenwerk

Wochenwerk is a vanilla TypeScript prototype for a calendar-driven weekly board for young children. The calendar is authoritative; the child-facing board is its visual projection. Licensed METACOM symbols remain local and are never committed.

- [Product](docs/product.md)
- [UX](docs/ux.md)
- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Hardware](docs/hardware.md)

## Prerequisites

- Node.js `>=22.13.0`

## METACOM symbols

Nothing licensed is served by this app. Symbols are read from your own folder in the browser through [`@lautstark/bildquelle`](https://github.com/Lautstark/bildquelle), which hands them to the page as object URLs and transmits nothing. Open **Kalender → Einstellungen → Ordner wählen** and point it at your **unframed** set — `Symbole_PNG/PNG_ohne_Rahmen`. The framed one carries a black border and a printed caption, neither of which the board wants.

Until a folder is connected the board draws each symbol's name instead of its picture. That state is for whoever is setting it up, not for the child.

Chromium on a desktop only for the folder picker: `showDirectoryPicker` is absent from Safari, from Firefox and from every browser on Android. Where it is missing the same panel reads a folder as an upload instead, and either browser can read a ZIP.

## Quick Start

```bash
npm install
npm run dev
npm run build
```

## Routes

- `/` — the board: the symbol view of the week, for the child
- `/kalender.html` — the calendar: a week grid of hours and columns, for parents

Both read and write the same IndexedDB store, so a change in the calendar reaches the board within a minute. The board runs on the real wall clock: the current weekday, the dates of the week and the now state come from the system time, and it redraws on every minute boundary.

An empty database seeds itself with a mock household routine for the current week, so there is something to look at before anything has been planned.

Still missing: the shared folder that [ADR 002](docs/decisions/002-browser-only-and-a-shared-folder.md) proposes as the store, any NFC input, and speech. There is no server, no account and no authentication, and there is not meant to be.
