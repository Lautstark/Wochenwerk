# ADR 002: Browser only, and the calendar lives in a folder

**Status: proposed; partly built.** The browser-only half is done — two routes, no
server, symbols through `bildquelle`, one record per appointment under a UUID, and
repetition as a way of writing many of them rather than a rule stored instead. The
store is IndexedDB for now: the folder waits on the licence question below and on
`sicherung`'s own ADR, and a per-record store is the shape that moves there without
a rewrite. Replaces the server half of [ADR 001](001-dates-and-sse.md):
the date model there stands, the SSE channel does not.

## Context

[Architecture](../architecture.md) describes a containerised web app on the NAS,
SQLite behind it, Server-Sent Events for refresh, and a supervised PC/SC process
on the Wyse reporting card reads over HTTP. Every piece of that is reasonable on
its own. Together they make Wochenwerk the only project in this family that runs
a server.

Lautstark decided against that everywhere else, once, as a rule rather than four
times as a coincidence: *No server and no accounts, anywhere in the toolchain*,
stated as applying to every Lautstark project. The builder is a static page,
speech happens in the tab, symbols are fetched from ARASAAC or read from the
user's own licensed folder, and content reaches the talker down a cable.

Three shared packages already solve what Wochenwerk was about to solve again:

- **`@lautstark/bildquelle`** reads the user's licensed METACOM folder through the
  File System Access API and hands symbols out as object URLs rather than bytes.
  A test fails its build if a network call appears in the METACOM provider. The
  prototype's `public/metacom-local` symlink is the exact construction this
  package exists to prevent — a build copies the whole licensed collection into
  `dist/`, and a deploy would then serve it.
- **`@lautstark/stimmquelle`** runs piper in the tab, under a licence gate. The
  spoken cue that [hardware](../hardware.md) sketches for information cards, and
  speech for an open choice, are the same mechanism.
- **`@lautstark/sicherung`** already carries the reasoning for the storage half:
  a folder inside Dropbox, iCloud Drive or Nextcloud is synced by software the
  household installed on purpose, so writing a file there is the whole of the
  cloud story — no account, no OAuth client, no token, no server of ours.

`sicherung` carries the reasoning but not the mechanism. It only writes — there
is no `getFile` anywhere in its source — because its premise is that the product
owns the data and the folder is a copy downstream of it. Wochenwerk's premise is
the reverse: the folder owns the data and several people write into it. Same
folder, opposite direction, and a different central problem — conflicts, which a
one-writer backup cannot have.

## Decision

**Wochenwerk is a static page with two routes. The calendar lives in a folder the
household picks, and nothing of ours runs anywhere.**

- **The calendar** is where appointments are kept: times, symbols, people, the
  options an undecided appointment offers. Chromium on a laptop.
- **The board** is the symbol view of that same calendar. The Wyse in its frame
  is one deployment of it, not a requirement — the same route opens on a laptop,
  a tablet or a second screen, and is useful there.

Two routes in one app rather than two repositories: they share the data model,
the symbol provider and the design tokens, and there is nothing yet pulling them
apart. vorlaut split its own repository only once the halves had actually
diverged, not in advance.

How the folder works, and what it replaces:

- The folder is opened through the File System Access API and kept as a handle,
  the way `sicherung` keeps its own. Both routes open the same folder.
- **Repetition writes appointments rather than storing a rule.** Bounded by a date
  or a count, tagged with the batch. A rule as the stored truth would need an
  override record for every exception, an identity for every occurrence to hang a
  resolved choice on, and a version so that changing October does not rewrite
  September. Concrete records need none of that, and a week stays a range query.
- **One file per appointment**, named by UUID, not one file per calendar. Sync
  clients do not merge; they write a conflicted copy. Per appointment, a conflict
  needs two people editing the same appointment at the same time, which does not
  happen. Per calendar, it needs two people planning the same evening, which
  does.
- **The board polls the folder** instead of receiving events. A synced folder
  already carries changes between machines within seconds, and polling a handful
  of small files costs nothing. This is what replaces SSE.
- **The board writes only one thing**: the option that was chosen for an
  undecided appointment — a write to that appointment's own file.
- **Symbols come through `bildquelle`**, from the household's own METACOM folder,
  never from a path the page serves.
- **An appointment names its symbol the same way whatever the source, and that
  name goes in the folder.** No second kind of symbol, no calendar that is half
  shareable, no rule a person has to be told.

  The family's convention today is absolute — nothing derived from a licensed
  collection goes in such a folder, not even a filename index. Read for its
  purpose rather than its wording, that rule is about nobody being able to *use*
  the collection without licensing it, and a reference does not carry that:
  `kindergaertnerin.png` without the file renders nothing, and METACOM cannot be
  used from filenames. What would carry it is the files themselves, or a complete
  index — which is why "or a count of what is in it" is in the rule. What still
  may not travel is exactly that: the files, an index, a count.

  This is not a proposal. Two products already draw exactly this line in code:
  `vorlaut-editor/src/data/backup.ts` drops the METACOM folder path and its file
  count while letting the board's own `metacom:` references travel — "a reference
  is a symbol the user chose and put on their own board; an index is an
  enumeration of what they licensed" — and its test calls a failure there "a leak
  or a licence, not a bug to triage". bildhaft's export draws the same line.

  So `design/docs/conventions.md` §2.3 is the document that is behind, not the
  practice. It still records "Diverging: nobody" while its wording — "never a
  path into a licensed collection" — reads as forbidding what two consumers
  deliberately do. The word *path* is carrying two meanings: where the collection
  lives, which is dropped, and a reference to one item in it, which travels. The
  wording it needs is roughly: *never the files of a licensed collection, never
  an index of one and never a count; a reference to a single item the person
  chose travels with the document that uses it.*
- **The folder is a store, not a copy — and that is a family-level change.** A
  product keeps its data *either* in IndexedDB *or* in a chosen folder; never in
  both, so there is never a second source of truth to reconcile. Whoever holds
  the folder can open it, which is what makes a household calendar work and what
  lets anyone else keep one Sammlung across two machines.

  Conflicts are reported, not merged. A sync client that cannot merge writes a
  second file beside the first; the store sees both, says so, and the person
  picks which one survives. A merge is attempted only where it is trivially safe,
  and by default it is not attempted at all.

  Whether this is an evolved `@lautstark/sicherung` or a sibling beside it is a
  decision for that repository, not this one — it changes a package three
  shipping products depend on, and deserves its own ADR there. Wochenwerk assumes
  it exists and needs four things from it: open a folder and keep the handle,
  read and write one record per file, notice that a file changed, and surface a
  conflict as a choice.
- **An input picks an option; it is not part of the calendar.** An undecided
  appointment offers options, and an option carries a symbol and may carry
  something spoken. Anything that can name one of those options resolves the
  appointment: a card, a tap on the screen, a key. The calendar knows options; it
  does not know cards.

  This is what makes NFC an accessory rather than a feature. The mapping from a
  tag's UID to an option is input configuration and lives with the reader, not
  with the appointment — so `PhysicalCard` and `ChoiceOption.physicalCardId` in
  the [data model](../data-model.md) belong on the input side. It also means the
  board is usable with no reader attached at all, which is how it can open on a
  laptop.

- **The reader is a local device, and the board hears it through a bridge.**
  *Revised.* This bullet first said that a reader in HID keyboard mode would do —
  a `keydown` handler, no PC/SC process, no bridge, no driver. That holds only for
  a design in which a card is *tapped*. The board's design turned out to rest on
  presence instead: a card lying in the slot is the answer, and taking it out
  withdraws it while the appointment is still ahead (see [UX](../ux.md)). A
  keyboard-mode reader can say that a tag was held to it and can never say that it
  was taken away.

  PC/SC says both, natively and without any invention of ours — on the ACR122U
  `SCardGetStatusChange` reports arrival and departure continuously. No browser
  speaks PC/SC, so a small process on the same machine does: `tools/leser.py`,
  standard library only, which polls the reader and streams `{"uid": …}` and
  `{"uid": null}` to the page over localhost. Web Serial and WebUSB were the
  browser-native alternatives and were dropped: both are gated on a user gesture
  and a per-origin permission, which is the wrong dependency for an appliance that
  must come up on its own after a power cut.

  This stays inside the rule the ADR is about, and the line is worth stating so
  nobody has to re-derive it: the bridge knows no appointments, stores nothing,
  answers no questions and keeps no state that outlives it. It is a device driver
  that happens to speak HTTP, not a backend — the board still holds the data, still
  runs with no reader attached, and a bridge that dies costs presence rather than
  the week. What it may never become is a place where anything is decided or kept.
  The 20 cm of cable from the slot to the Wyse stays inside the frame; making that
  link wireless would buy nothing and add a battery, a pairing and a failure state.

## What this costs

**Planning needs Chromium on a desktop.** `showDirectoryPicker` is absent from
Safari and Firefox on every platform and from every browser on Android, Chrome
included. There is no phone route to a shared folder, and the household has
accepted that: planning happens on a laptop, the board runs on the Wyse, and both
are Chromium.

**One thing is not settled here, and cannot be.** Whether METACOM's actual licence
permits a filename in a shared document is the licence text, not a house rule,
and a house rule cannot grant what the licence withholds. Read it before the
folder is shared with anyone outside the household.

## What stays

The date model of ADR 001, the 15-minute grid, the resolved-week contract the
board renders against, the display, the Wyse, the slot and the card sizes from
[hardware](../hardware.md). This changes where the data lives and who serves it,
not what is on screen.
