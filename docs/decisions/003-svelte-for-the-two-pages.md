# ADR 003: The two pages are Svelte components over the same core

**Status: built, 2026-09-16.** Pilot for the family — the first of the four
Lautstark web products to take a rendering framework, chosen because it is the
smallest and shares no Sammlung shell with the others. What the pilot was to
find out, and what it found, is at the end.

## Context

Until this change the two pages were drawn three ways. The board (`main.ts`)
assembled an HTML string on every minute and set `innerHTML`. The calendar's
views built elements with `el()` from `@lautstark/werkzeuge/dom` and refilled
containers on every change (`fill`, `sync()` in each dialog). The settings
sheet and the appointment sheet each carried their own hand-written
reconciliation — which node to keep so the caret stays, which to rebuild — and
each got it wrong once before getting it right (the comments above `hold()`
and `resolve()` recorded both). The family's architecture review of 2026-09-15
counted three rendering idioms across the four web products and named the
DOM-ownership question — who builds a node and who repaints it — as the thing
that had blocked every larger shared surface.

The core was never the problem: `model.ts`, `announce.ts`, `db.ts`, `speech.ts`,
`symbols.ts` and `folder.ts` hold no DOM and are covered by the unit tests.
The question was only how the top layer is drawn.

## Decision

The two pages are Svelte 5 components. `src/board/Board.svelte` draws the week
on the wall from a runes store (`board/board.svelte.ts`) that the card reader,
the minute tick and the key press write into; `src/kalender/Kalender.svelte`
draws the calendar from `store.svelte.ts`, which replaced the subscriber list
with one `$state.raw` week. Every dialog is a body component, and where a
foot or a head is needed, one more, all sharing one state object the opener
made.

Three things were kept on purpose:

- **The core is untouched.** Not one line in `model.ts`, `announce.ts`,
  `db.ts`, `speech.ts`, `symbols.ts`, `folder.ts`, `backup.ts`, `screen.ts` or
  `reader.ts` changed. The unit tests did not either.
- **The dialog frame is still `@lautstark/design/dialog`.** The head with its
  ✕, the body, the foot, the backdrop press and the one `close` exit are the
  package's, drawn as every Lautstark programme draws them. `kalender/sheet.svelte.ts`
  mounts components straight into the frame's own containers, with no wrapper
  between, because `components.css` styles those children directly. The nine
  visual baselines pass at a tolerance of zero, which is the proof.
- **The shared vanilla panels are still vanilla.** `@lautstark/sicherung`'s
  two panels, `@lautstark/bildquelle`'s METACOM panel and
  `@lautstark/stimmquelle`'s voice picker are built once per sheet and put in
  place by `pieces/Vanilla.svelte`, a `display: contents` host. Nothing in the
  shared packages had to change for this product to move.

Not chosen, and why:

- **Vanilla, but one idiom** (bildhaft's `{node, render(state)}` factories).
  Clean, dependency-free, and the fallback if the pilot had failed. It costs
  keeping a reconciler by hand in every product — `place()`, keyed views,
  signature guards — and that is the code that was wrong three times here.
- **React or Preact.** The dependency-array class of bug is what bildhaft left
  React over on 2026-08-22.
- **Lit / web components.** Shadow DOM fights the class vocabulary in
  `components.css` and the donated tablets the products run on.
- **Solid.** Technically closest; JSX instead of scoped CSS, and scoped CSS is
  conventions.md §4.12 ("a module that emits markup brings its CSS") by
  construction.

## What the pilot measured

The 37 behaviour cases in `e2e/kalender.spec.ts` and `e2e/board.spec.ts` and
the 10 visual cases (9 baselines) were written against the old rendering and
pass unchanged against the new one. That is the contract, and it held on the first
full run but for one thing: a record handed to a component becomes a `$state`
proxy, and `structuredClone()` and IndexedDB both refuse a proxy — every write
goes through `$state.snapshot()` now. Worth knowing before the next product.

Bundle, gzipped, what the browser actually fetches:

| chunk | before | after |
| --- | --- | --- |
| board entry | 4.8 kB | 6.0 kB |
| kalender entry | 25.8 kB | 31.5 kB |
| shared chunk (views, db, and now the Svelte runtime) | 31.9 kB | 49.0 kB |
| speech and symbols (onnxruntime, piper, jszip) | 97.3 kB | 97.3 kB |
| **whole page** | **~160 kB** | **~184 kB** |

Fifteen per cent more on the wire, all of it the runtime and the compiled
templates; the speech stack is still two thirds of the page. On the thin
client on the wall this is not a number anybody will notice, and it is the
price of never writing a reconciler again.

Lines: 5.4k of TypeScript became 4.9k of TypeScript and Svelte, with every
`sync()`, `fill()` and `hold()` gone. `svelte-check` replaces `tsc --noEmit`
and checks the components too.

## Consequences

- `npm run typecheck` is `svelte-check`. `tools/no-private.mjs` reads
  `.svelte` files now, because they carry words.
- The next product to move gets the same shape: one runes store, components
  for the page and each sheet body, the design frame and the shared panels
  left as they are, `$state.snapshot()` at every write.
- The sheets in this product carry their contents as components but the
  frame is imported; when a second product has moved, that frame is the first
  thing worth turning into a shared component, and the shared panels the
  second — by the two-consumer rule, as always.
