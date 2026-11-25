# ADR 004: The week first, the folder after — and one word for the time between

**Status: built, 2026-11-25.**

## Context

Opening the calendar took long enough to be the complaint, and it was not the
calendar. Measured on the dev server without a folder, saving an appointment is
5 ms and reading the week back is 4 ms. What the page waited on before it drew
anything was, in this order:

1. METACOM being reconnected (`restore()`), which is quick: the index is kept.
2. The folder being read (`pullFromFolder()`): what this browser owes it is
   written, and then **every record file of every kind is opened and read**, one
   after the other within a kind, and the mirror is replaced with the result.
   On a share across the house that is several round trips per file.
3. The week being read (`load(0)`) — which itself waited until every picture on
   it was resolved before setting anything. With METACOM connected as a ZIP, the
   first picture unpacks the whole archive.

Until all three were done the page showed the empty state, „Noch nichts
geplant", over a week that was sitting in IndexedDB the whole time.

The mirror is not a guess. It is what the folder held when this browser last
read it, plus whatever was planned here since (ADR 002). Drawing it first costs
nothing in truth as long as the page says that it is about to be checked, and
does not let anybody plan against it until it has been.

## Decision

**1. The mirror is drawn before anything is reached for.** `kalender.ts` asks
for the week straight after mounting. The folder and METACOM are reached for
afterwards, as before and in the same order, and the week is read again once
the folder has had its say.

**2. Pictures follow the week rather than holding it.** `load()` sets the week
with the pictures already known, then resolves the rest and sets it again. A
newer `load()` wins over an older one still resolving, so a week stepped away
from never draws its pictures over the one now shown. A symbol whose picture is
not there yet is drawn the way a missing picture always was.

**3. A sync is one state, said in one place.** `pullFromFolder()` is the only
thing that replaces the mirror with the folder, and every route to it — the
boot, the half-minute poll, coming home (`reaching.svelte.ts`), the permission
click — goes through it. So `db.ts` says from there that a sync is running
(`onSyncing`), `syncing.svelte.ts` holds it as a rune, and the page reads it.
Nothing that calls `pullFromFolder()` has to remember to say so.

The page also counts the boot itself as unconfirmed, from the first draw until
`kalender.ts` calls `booted()` after the folder's answer: between the mirror
being drawn and the sync beginning lie METACOM's reconnect and the folder's,
and a sheet opened then would plan against the same unchecked week. Where no
folder is connected that is a few milliseconds.

**4. No planning while it runs, held at two levels.**

- *The store.* `keep()` and `dropRecord()` — the two funnels every write goes
  through — wait for a running sync before they write. `pull()` empties four
  stores and fills them again; a write landing in between was a write the next
  line deleted. This is the guarantee, and it holds for writes nobody is
  looking at: the settings sheet, a sheet opened before a poll began.
  `settleUp()` and `pull()` themselves never go through the funnels, which is
  what makes waiting there safe rather than a deadlock.
- *The page.* A sheet opened on the mirror before the sync ends is a sheet
  holding what may be yesterday's version of somebody else's appointment, and
  saving it would quietly put yesterday back. So while a sync runs, „＋ Termin"
  is disabled and a click into the week says why instead of opening anything.
  Stepping between weeks and opening Einstellungen stay possible: neither plans
  against the week on screen.

**5. The indicator is a sentence, not a spinner.** „Abgleich mit dem Ordner …"
stands in the top bar beside the week's dates, for as long as the state is
true and not longer. It does not stand over the week: the folder banners do,
and they are conditions somebody may have to act on. A sync is something to
wait for. The empty state is not shown while a sync runs, because until it
ends „Noch nichts geplant" is not known to be true.

## What this does not change

- **A save still waits for the folder.** `keep()` writes IndexedDB and then the
  file, and the sheet closes when both are done. Closing it after IndexedDB and
  writing the file afterwards is a separate change to the order inside the
  funnels, with the `waiting` row written first; it is not part of this one.
  *ADR 005 made that change the same day.*
- **The board** (`main.ts`) boots the old way. It is a display that is reloaded
  rarely and nobody plans on it; the same order would suit it and can follow.
- **The folder is still read whole.** Reading only the files whose stamps
  changed would make the sync itself shorter. This decision makes it something
  nobody has to stare at, which is the half that was missing.
