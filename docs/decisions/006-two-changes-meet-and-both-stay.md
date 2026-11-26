# ADR 006: Two changes to one record meet, and both stay

**Status: built, 2026-11-25.**

## Context

Every record is a file of its own in the folder, so two people planning two
different appointments never touch each other. Two people changing *the same*
record did: whoever's file landed last was the record, whole, and the other
change was gone without a word. A device sees the other's change at the next
poll, half a minute later, so "at the same time" meant anything inside that —
or longer, for a sheet left open while the poll brought the other change in.

The record where this hurt most is a series. A series is one file, and the days
taken out of it one at a time are a list inside it. Taking Monday out on the
laptop and Wednesday out on the tablet wrote two lists, and the second one won:
Monday came back.

The only rule for two versions was `settleUp`'s, for changes made away from the
folder: the later `updatedAt` wins, the whole record. It compares two device
clocks, and it cannot keep two changes that touched different fields.

## Decision

**1. A change remembers what it was a change of.** The `waiting` row a save
leaves (ADR 005) carries `base`: the record as this browser held it before the
change, `null` for one that did not exist. Two saves before a delivery keep the
first base, because that is what the folder still has. A delivery that lands
moves the base on to what it wrote.

**2. A delivery reads the folder's copy before it writes.** One file, in the
background. If it is still the base — same `updatedAt`, compared for equality,
so device clocks do not matter — nobody else wrote, and ours goes in as it is.
If it is not, somebody else saved since, and the two are merged.

**3. The merge is three-way and field by field** (`src/merge.ts`). For every
field: changed only here — ours; changed only there — theirs; changed on both
to the same value — that. Nested objects (a series' shape, the sayings) are
merged the same way, one level down at a time. Only where both changed one
field to different values is it a clash, and there the later `updatedAt`
wins that field — the one place a clock still decides, and the person is told.

A series' `skipped` is a set, not a value: what either side took out stays out,
and what either side put back is back. Monday and Wednesday are both gone.

The merged record is written to the folder and to this browser, under a new
`updatedAt`; the other device picks it up at its next poll.

**4. An edit beats a deletion.** Deleted here and changed there: the change
stays and comes back. Changed here and deleted there: ours brings it back.
Either way the person is told. An appointment that stays by mistake is deleted
again in two clicks; one gone by mistake is gone.

**5. The same merge runs at the save, for a sheet left open.** A save says which
version it started from (its `updatedAt` before the save stamps it). Where this
browser has meanwhile taken a newer version from the folder, the version the
sheet started from is still known — `pull` remembers, for this tab, what it
replaced — and the save is merged against the newer one instead of replacing
it. Where it is not known, the save goes in as before.

**6. A clash is said where the planning happens.** `db.ts` says so through
`onClash`, from the delivery and from `settleUp` alike, and the calendar's
status line names the record: „Turnen“ wurde gleichzeitig woanders geändert …
The count-only sentence the settling used to say for clashes goes; the
settling still says how many changes it carried over.

## What remains open

- **The moment between reading and writing.** Two devices that read the same
  file inside the same fraction of a second, and both write, still end with the
  second. A shared folder has no lock to close that with.
- **Rows from before this change** carry no base. They are settled by the old
  rule, later `updatedAt` wins the whole record, once, and then there are none.
- **The batches** — import, emptying the calendar, adopting a folder — still
  push whole kinds as before. They are deliberate acts on everything, not edits
  that can meet.
