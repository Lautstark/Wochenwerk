# Domain model

Four records, and the first two are nearly all of it. This is what the code holds;
the earlier daypart-and-slot table is gone, along with the separate visit and
birthday record it used to need.

## `Appointment`

| Field | Purpose |
| --- | --- |
| `id` | UUID. The record's identity, and its filename when the store moves into a folder. |
| `date` | One day, ISO. Indexed, so a week is a range query. |
| `start`, `end` | Absent on both means all day. |
| `title` | A name of its own. Without one it is called after what it shows. |
| `symbols` | What it shows, directly. An ordinary appointment needs nothing else. |
| `options`, `chosen` | Which cards are offered, and which one an input picked. |
| `people`, `showPeople` | Who it concerns, and whether the board shows them. |
| `series` | Which batch it was created in, if any. A label, never a rule. |

**An appointment is always concrete.** No rule is ever stored in its place, so the
board reads what was planned rather than working anything out, and a change to what
happens from October cannot rewrite what September's board showed.

**There is one kind of it.** Timed or all-day is a property, not a type. So is
decided or still open. Visit and birthday are all-day appointments with a person on
them; a birthday's crown is the symbol it carries, not a drawing in the stylesheet.
A day fact with no person — a holiday, a closed Kita — is the same record with a
symbol and nobody on it.

## `Card`

| Field | Purpose |
| --- | --- |
| `id` | UUID. |
| `name` | What it is called. |
| `symbol` | The picture on it. |
| `speech` | What is said when it is offered. |
| `nfc` | The tag's identifier — how the board recognises the card. |
| `tone` | Its colour in the calendar. |

**A card is a record because it is an object.** It is a laminated picture with an
NFC tag, it lives in a drawer, and it is laid out when a choice is offered. That is
what makes it worth naming, worth giving a spoken line, and what makes the tag
mapping belong to it.

**An ordinary appointment has none of this.** It carries its symbols directly. It is
written once — as a series, usually — and a picture is all the board asks of it;
wrapping every Frühstück in a record would be an abstraction with nothing on the
other side of it.

Colour follows from that: a card has a chosen tone, and an appointment without one
derives its colour from its first symbol, so the same picture is always the same
colour without anything being stored.

## `Series`

| Field | Purpose |
| --- | --- |
| `id` | UUID, referenced by every appointment the batch produced. |
| `pattern` | `daily`, `weekly` with weekdays, or `yearly`. |
| `from`, `until` | Where the batch started and stopped. A count is turned into an `until` when it is created. |
| `allDay` | What shape the batch had, for listing it. |

A repetition is **a way of writing many appointments at once**, not a rule stored
instead of them. Creating one writes the appointments; the series only remembers
how, so a batch can be listed, extended and cleared together.

**A series is not authoritative.** Losing it loses those three conveniences and
nothing else — the appointments stand on their own, and the board never sees it.
That is what makes an exception free: a Kita day that falls away is one record
deleted, and nothing else has to know.

It also records how the appointments were **created**, not what they **are**. After
a few individual edits the pattern no longer describes all of them, which is why an
action over a series says how many records it will touch before it touches them.

A visit across a weekend is the same mechanism as a weekly Kita, only shorter.

## `Person`

`id`, `name`, `initials`, `tone`, `photo`. An avatar is the photo where there is one
and the initials otherwise. A photo is centre-cropped and shrunk to 160 px before it
is stored, because these records go into a synced folder later.

## Not modelled here

The NFC card. An input picks one of the options an appointment offers; which tag
means which option is configuration of the reader, and belongs with it. That is
what lets a tap or a key resolve a choice as well as a card, and lets the board run
with no reader attached. See [ADR 002](decisions/002-browser-only-and-a-shared-folder.md).
