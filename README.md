# Wochenwerk

Wochenwerk is a vanilla TypeScript prototype for a calendar-driven weekly board for young children. The calendar is authoritative; the child-facing board is its visual projection. Licensed METACOM symbols remain local and are never committed.

- [Product](docs/product.md)
- [UX](docs/ux.md)
- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Hardware](docs/hardware.md)

## Prerequisites

- Node.js `>=22.13.0`

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

The prototype is intentionally static. It has no authentication, persistence, NFC implementation, or server-side planning logic yet.
