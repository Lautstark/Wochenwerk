# ADR 005: A save is done when the browser has it; the folder is delivered to

**Status: built, 2026-11-25.**

## Context

Every change goes through two funnels in `db.ts`, `keep()` and `dropRecord()`.
Until now both wrote IndexedDB, then wrote or removed the file in the folder,
and only then returned. The sheet waits for the funnel, so it stood open until
the folder had answered. On a share across the house one file costs several
round trips — opening the kind's folder, the file, a swap file, writing,
swapping it in — and moving one day of a series writes up to three files one
after the other. Without a folder the same save is 5 ms.

The folder still has to get every change, and ADR 002 and `waiting` already say
how that is made safe: a change the folder has not had is a row in `waiting`,
and `settleUp()` pays the rows before anything reads the folder back. Until now
a row was written only once a write had failed.

## Decision

**1. The debt is written first.** A funnel writes the record to IndexedDB, then
the row saying the folder is owed it, and returns. That is when a save is done:
the sheet closes, the week is drawn again, the standing backup hears of it.

**2. The folder is delivered to afterwards, one record at a time, in order.**
Each funnel puts a delivery on one queue (`outbox`). A delivery reads the
record *as IndexedDB holds it now* — present means write the file, gone means
remove it — so three quick edits of one appointment deliver its latest state,
and an edit then a deletion delivers the deletion. Order on the queue is the
order the changes were made.

**3. A row is paid only for what was delivered.** A delivery remembers the
row's time before it reads the record, and deletes the row only if it still
has that time. An edit made while the delivery was under way leaves a newer
row, which its own delivery pays. Whatever happens in between — the tab closed,
the laptop shut, the share gone — the row is still there, and `settleUp()`
pays it later exactly as it pays a change made away from home.

**4. Everything that reads or rewrites the folder waits for the queue first.**
`settleUp()` (and so every sync, ADR 004), and the batches that push a whole
kind — import, emptying the calendar, adopting a folder — wait until the queue
is empty. A folder read back while our own change is still on its way is a
folder that does not have it yet, and the read would put the old version back
on screen.

## What this changes for people

- With a folder, a sheet closes as fast as without one.
- With the folder out of reach, nothing changes: the delivery fails, the row
  stays, the banner says so on the next look, and coming home pays it.
- The row now exists for a moment on every save. A look that happens to run in
  that moment says „1 Änderung wird gerade nachgereicht", which is true.

## What this does not change

Writes still reach the folder one file at a time, and the folder is still read
whole on every sync. Both are what the folder costs; this decision only stops
anybody from waiting for it.
