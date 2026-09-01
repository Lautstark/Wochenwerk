# Wochenwerk

Wochenwerk is a vanilla TypeScript prototype for a calendar-driven weekly board for young children. The calendar is authoritative; the child-facing board is its visual projection. Licensed METACOM symbols remain local and are never committed.

- [Product](docs/product.md)
- [UX](docs/ux.md)
- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Hardware](docs/hardware.md)

## Prerequisites

- Node.js `>=22.13.0`

## Nobody real goes in here

This repository is public and its history is published, so no household's own
week belongs in it — not in a doc, not in a fixture, not in seed data. Examples
use placeholders.

`tools/no-private.mjs` is the floor under that rule. It refuses anything in the
working tree that matches a term in `.private-names`, which is git-ignored so
that the terms are not themselves committed: one per line, `#` for comments. It
runs on `npm test`, and on every commit once the hooks are enabled:

```bash
git config core.hooksPath .githooks
```

Without `.private-names` the check passes and says so. It catches the names
somebody thought to write down, which is not the same as catching every one.

## METACOM symbols

Nothing licensed is served by this app. Symbols are read from your own folder in the browser through [`@lautstark/bildquelle`](https://github.com/Lautstark/bildquelle), which hands them to the page as object URLs and transmits nothing. Open **Kalender → Einstellungen → Ordner wählen** and point it at your **unframed** set — `Symbole_PNG/PNG_ohne_Rahmen`. The framed one carries a black border and a printed caption, neither of which the board wants.

Which set a household draws from follows from the folder and is never picked: with a folder connected the symbols are METACOM's, and without one they come from [ARASAAC](https://arasaac.org), which needs no setup. So a household with no folder still gets pictures. What draws a name instead of a picture is narrower than it used to be — a symbol already stored as a METACOM reference while the folder is missing. That state is for whoever is setting it up, not for the child.

ARASAAC's licence asks for its notice wherever its symbols are shown, so the board, the calendar and the symbol search each carry it whenever what they draw came from ARASAAC.

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

Nothing is seeded. A new database is empty and the board says so until a week has been planned in the calendar — a household's own routine is what the board is for, and a mock one could not be told apart from it.

Still missing: the shared folder that [ADR 002](docs/decisions/002-browser-only-and-a-shared-folder.md) proposes as the store, any NFC input, and speech. There is no server, no account and no authentication, and there is not meant to be.
