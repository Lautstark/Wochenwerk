# Domain model

Four records, and the first two are nearly all of it — plus a fifth that holds no domain at all. This is what the code holds;
the earlier daypart-and-slot table is gone, along with the separate visit and
birthday record it used to need.

## `Appointment`

| Field | Purpose |
| --- | --- |
| `id` | UUID. The record's identity, and its filename when the store moves into a folder. |
| `date` | One day, ISO. Indexed, so a week is a range query. |
| `start`, `end` | Absent on both means all day. |
| `title` | A name of its own. Without one it is called after what it shows. |
| `speech` | The word said out loud, where that is not the title. Usually empty. |
| `symbols` | What it shows, directly. An ordinary appointment needs nothing else. |
| `options`, `chosen` | Which cards are offered, and which one an input picked. |
| `people`, `showPeople` | Who it concerns, and whether the board shows them. |
| `away` | All-day only: the household is not at home. Read by the announcement, never drawn. |
| `series` | Which batch it was created in, if any. A label, never a rule. |

**An appointment is always concrete.** No rule is ever stored in its place, so the
board reads what was planned rather than working anything out, and a change to what
happens from October cannot rewrite what September's board showed.

**`away` changes nothing about what is drawn.** An absence is the same all-day
bar it always was, carrying whatever picture the household gave it, and the board
never reads the field. What reads it is the announcement, which has to choose
between *Bald fahren wir weg* and saying nothing at all — a picture never has to
know what it means, and a sentence does. Deriving it from the length of the
stretch instead would announce a week of holiday care as a trip. See
[speech](speech.md).

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
| `speech` | The word said out loud, where that is not the name. Usually empty. |
| `nfc` | The tag's identifier — how the board recognises the card. Several, comma separated, where one card exists as more than one object: the same choice laminated twice, or a sticker that was replaced. Spelling does not matter; only the hex digits are compared. |

**A card is a record because it is an object.** It is a laminated picture with an
NFC tag, it lives in a drawer, and it is laid out when a choice is offered. That is
what makes it worth naming, worth giving a word of its own, and what makes the tag
mapping belong to it.

**Neither `speech` holds a sentence.** Both hold a noun. Every spoken sentence is
a frame with one slot in it and the frames live in `announce.ts`, so a card
offered and the same card named an hour later are one word in two frames, and a
choice appointment needs nothing entered on it at all. See
[speech](speech.md).

**An ordinary appointment has none of this.** It carries its symbols directly. It is
written once — as a series, usually — and a picture is all the board asks of it;
wrapping every Frühstück in a record would be an abstraction with nothing on the
other side of it.

Colour follows from the picture, for a card and an appointment alike: the same
symbol is always the same colour, and nothing is stored or chosen. A card used to
carry a tone of its own; once an open choice drew a symbol like everything else,
there was nothing left for that tone to answer.

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

## `Settings`

One record under one constant key, holding every preference the household has made.
Today that is `azure` (the Speech key and region, passed to Microsoft from the tab
and nowhere else), `voice` (one stimmquelle voice for the whole calendar), and
`metacomRendering` (which of METACOM's parallel folders the search offers first).
All three are absent until somebody answers them.

**Every preference, and only here.** `conventions.md` §1.2 and §1.3: not
`localStorage`, which is a second store with its own eviction policy and which
survives the database being cleared, so a preference kept there would outlive the
data it is about. A preference living in two places is one that gets restored by
one of them and overwritten by the other.

**One record and not one per preference.** A settings store that grows a row per
answer stops being the settings. Every field is optional and absent means the
product's own default rather than a value written at install, which is what makes a
household that has answered nothing indistinguishable from one that was never
asked — and what makes the next preference a one-line change.

It is not domain data, and the two deletions say so: emptying the calendar and
deleting everything both name the appointments, the cards and the people, and take
exactly those.

## Not modelled here

The NFC card. An input picks one of the options an appointment offers; which tag
means which option is configuration of the reader, and belongs with it. That is
what lets a tap or a key resolve a choice as well as a card, and lets the board run
with no reader attached. See [ADR 002](decisions/002-browser-only-and-a-shared-folder.md).
