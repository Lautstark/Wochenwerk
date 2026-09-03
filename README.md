# Wochenwerk

Wochenwerk is a vanilla TypeScript prototype for a calendar-driven weekly board for young children. The calendar is authoritative; the child-facing board is its visual projection. Licensed METACOM symbols remain local and are never committed.

- [Product](docs/product.md)
- [UX](docs/ux.md)
- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Speech](docs/speech.md)
- [Hardware](docs/hardware.md)

## Prerequisites

- Node.js `>=22.13.0`

## Nobody real goes in here

This repository is going public, and going public publishes everything it has
ever held — so no household's own week belongs in it, and never did: not in a
doc, not in a fixture, not in seed data. Examples use placeholders.

The rule is written for the day it is published rather than for today, because a
name is committed long before that day and there is no moment at which it
becomes safe to have started.

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

Nothing licensed is served by this app. Symbols are read from your own folder in the browser through [`@lautstark/bildquelle`](https://github.com/Lautstark/bildquelle), which hands them to the page as object URLs and transmits nothing. Open **Kalender → Einstellungen → Symbole → Ordner wählen** and point it at the collection. Where it holds the same symbols several times over — with and without a frame, with and without the word printed on the picture — a **Darstellung** chooser appears beside the folder controls; pick `PNG_ohne_Rahmen` there, since the framed set carries a black border and a printed caption and the board wants neither. The preference orders the search and excludes nothing, so a symbol that exists in only one version stays reachable and what is already in the calendar keeps its picture. Pointing the picker straight at one subfolder does the opposite: it makes the rest of the collection unfindable.

Which set a household draws from follows from the folder and is never picked: with a folder connected the symbols are METACOM's, and without one they come from [ARASAAC](https://arasaac.org), which needs no setup. So a household with no folder still gets pictures. What draws a name instead of a picture is narrower than it used to be — a symbol already stored as a METACOM reference while the folder is missing. That state is for whoever is setting it up, not for the child. A reference whose exact path stops matching — because the folder came back by a different route, an upload rather than a picked directory, or a ZIP — is looked up by name against the current index, in the preferred Darstellung, so re-connecting does not cost the calendar its pictures.

ARASAAC's licence asks for its notice wherever its symbols are shown, so the board, the calendar and the symbol search each carry it whenever what they draw came from ARASAAC.

Chromium on a desktop only for the folder picker: `showDirectoryPicker` is absent from Safari, from Firefox and from every browser on Android. Where it is missing the same panel reads a folder as an upload instead, and either browser can read a ZIP.

## Quick Start

```bash
npm install
npm run dev
npm run build
```

## Checks

```bash
npm run typecheck            # types, including the e2e specs
npm test                 # nobody real, then vitest
npm run test:e2e         # Playwright: the settings dialog, pixel for pixel
npm run test:e2e:update  # re-record the baselines, on purpose
```

The e2e suite is a visual one and small on purpose. It photographs the settings dialog on `/kalender/` folded, and the **Ablage**, **Sicherung** and **Löschen** panels unfolded, comparing each against a PNG committed under `e2e/visual.spec.ts-snapshots/`. It exists because CSS is moving out of this product and into [`@lautstark/design`](https://github.com/Lautstark/design), and a move that is supposed to change nothing is the one change no behavioural test can catch.

The board at `/` is deliberately not photographed and must not be added. It is a display on a wall with its own system of weekday colours, committed to dark, and it is not part of what is being unified.

Baselines belong to the machine that drew them — these are a macOS Chromium's, which is why the file names end `-darwin.png`. CI runs the same suite with the comparison switched off, so what it proves there is that the route loads and every panel unfolds; the pixel gate is local. `--update-snapshots` is a deliberate act: read the diff first, because re-recording is how a regression becomes the new normal.

## Routes

- `/` — the board: the symbol view of the week, for the child
- `/kalender/` — the calendar: a week grid of hours and columns, for parents

Both read and write the same IndexedDB store, so a change in the calendar reaches the board within a minute. The board runs on the real wall clock: the current weekday, the dates of the week and the now state come from the system time, and it redraws on every minute boundary.

Nothing is seeded. A new database is empty and the board says so until a week has been planned in the calendar — a household's own routine is what the board is for, and a mock one could not be told apart from it.

An open choice is answered with a physical card. The board reads the slot through a small bridge on the same machine — `tools/leser.py`, standard library only — which polls PC/SC and streams what lies in the slot to the page; see [hardware](docs/hardware.md) for why that is a device driver and not a server. Without a reader nothing is missing: the board runs, the question simply waits.

Still missing: the shared folder that [ADR 002](docs/decisions/002-browser-only-and-a-shared-folder.md) proposes as the store. There is no server, no account and no authentication, and there is not meant to be.
