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

The board expects the licensed symbols under `public/metacom-local`, which is git-ignored. Link the **unframed** set — the framed one carries a black border and a printed caption, both of which the board does not want:

```bash
ln -s "<METACOM>/Symbole_PNG/PNG_ohne_Rahmen" public/metacom-local
```

## Quick Start

```bash
npm install
npm run dev
npm run build
```

## Prototype routes

- `/` — child-facing weekly board
- `/palette.html` — ten weekday colour palettes with bold/muted toggle
- `/symbols.html` — METACOM symbol treatment comparisons

The board runs on the real wall clock: the current weekday, the dates of the week and the now state are derived from the system time, and the board redraws on every minute boundary. Everything else is intentionally static — the appointments are a mock household routine, and there is no authentication, persistence, NFC implementation, or server-side planning logic yet.
