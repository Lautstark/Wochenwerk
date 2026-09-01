# Speech

One button, one announcement. The board says out loud what it already shows —
which day it is, what is running, what comes next, and whether there is
something to choose — and it says nothing unless it is asked.

The listener is two, and the other one is three and a half. That decides
everything below, including several things it forbids.

## What is never said

**No clock time, no date, no duration in minutes, no count.** *Zwanzig nach elf*
means nothing before school, and *noch zwanzig Minuten* means nothing either — a
child that age has no unit to hang it on. A button that says them teaches only
that the button makes noise.

Time is spoken the way the board already draws it: in the four METACOM dayparts
the rail carries — *morgens, mittags, nachmittags, abends* — and otherwise in the
order of what happens. *Nach dem Mittagessen* is a time a three-year-old can act
on. *Um halb zwei* is not.

The one number that survives is nights, because sleeping is the unit they
already own: *einmal schlafen, dann …*, and never more than once.

## The shape

Two or three short sentences, always in the same order, roughly eight seconds.
Predictability is the whole design — the child learns the button by hearing the
same shape every time — so the choice of what to say is made without any state
and cannot come out differently on two presses a minute apart.

**Day → now → next.** With one exception, which outranks all of it:

> **When a choice is open and running, the announcement is only the choice.**
> *Jetzt darfst du aussuchen. Leg eine Karte in den Schlitz.*

In that moment there is something for the child to do, and a sentence about
Tuesday in front of it is a sentence in the way. Everywhere else the choice is
not a slot of its own: it is how the **next** sentence is worded.

## The catalogue

**Day** — one sentence, and the weekday compounds with the daypart, so both
facts cost one line.

| when | said |
| --- | --- |
| always | *Heute ist Dienstagmorgen.* — and so *Dienstagmittag*, *Dienstagnachmittag*, *Dienstagabend* |
| the day carries an all-day appointment | *Heute ist Dienstag, und Mia hat Geburtstag.* / *Heute ist Dienstag, und Oma kommt.* |

**Now** — what the board draws as the lifted card.

| when | said |
| --- | --- |
| an appointment is running | *Jetzt ist Frühstück.* |
| it concerns exactly one person | *Mia, jetzt ist Turnen.* |
| it ends within one grid step | *Frühstück ist gleich fertig.* |
| nothing is running | *Gerade ist nichts. Du kannst spielen.* |

Addressing one child by name is the difference between an announcement and
being meant, and it is free: `people` is already on the record. Two names is a
list, so it is only done where there is exactly one.

**Next** — and this is where a choice appears.

| when | said |
| --- | --- |
| within ~20 minutes | *Gleich kommt Kita.* |
| further off, but soon after what is running | *Danach kommt Kita.* |
| further off, and nothing is running | *Dann kommt Kita.* |
| nothing near, and something is running | *Danach hast du frei.* |
| nothing near, and nothing is running | nothing — the *now* sentence has said it |
| next is an open choice | *Danach darfst du aussuchen.* |
| next is a decided choice | *Danach kommt Schwimmbad. Das hast du ausgesucht.* |
| nothing left today | *Heute kommt nichts mehr.* |
| nothing left today, and tomorrow has something | *Einmal schlafen, dann ist Kita.* |

**What is hours away is not named.** Told at nine in the morning that supper
comes after Kita, a two-year-old has been given a word and no time to hang it
on; what is true and useful at nine is that nothing is being waited for.

**And the wait is measured from the end of what is running, not from now.** A
child waits through the gap after Kita, never through Kita — so a Turnen at
quarter past two, following a Kita that ends at two, is *danach* at nine in the
morning, and a supper at six is not. *Gleich* is the one word that stays on the
wall clock, because it is a promise about how long the child is standing there.

**Choice, while it is running** — the whole announcement, alone.

| when | said |
| --- | --- |
| open, up to three options | *Jetzt darfst du aussuchen: Schwimmbad oder Spielplatz. Leg eine Karte in den Schlitz.* |
| open, more than three | *Jetzt darfst du aussuchen. Schau, welche Karten daliegen, und leg eine in den Schlitz.* |
| decided, and running | *Jetzt ist Schwimmbad. Das hast du ausgesucht.* |
| decided, and ahead | *Danach kommt Schwimmbad. Das hast du ausgesucht.* |

Beyond three, naming the options is a list nobody can hold, so the sentence points
at the table instead of reciting it. It does the same when **any one** option has
no name: three of four named would describe a table the child is looking at,
wrongly.

*Du kannst die Karte wieder rausnehmen* is not here. Whether a card is still in
the reader is the input's state and not the calendar's — the appointment only
records that something picked an option — so that sentence belongs with the
reader when there is one.

## Where the words come from

Nothing new is stored. Every variable part of a sentence is a name some record
already carries, and the announcement derives them the way
[`titleOf`](../src/model.ts) derives a card's caption.

| in a sentence | from |
| --- | --- |
| *Frühstück*, *Kita* | the appointment's `speech`, else its `title` |
| *Schwimmbad*, *Bouldern* | the card's `speech`, else its `name` |
| *Mia*, *Oma* | `Person.name` |
| *Dienstag* | the date |
| *morgen … abend* | `daypartTimes`, the same four the rail is drawn from |

**Never a symbol label.** That is the one rule this table exists for. A label is
a file name — the breakfast picture is `fruehstueck2.png` and the Kita one is
`kindergaertnerin.png` — and `derivedName` falling back to it is right for the
calendar, where it is a caption under the picture it came from, and wrong out
loud, where it becomes a word no child has ever heard applied to their morning.
So `spokenName` stops where `titleOf` continues, and returns nothing.

**An appointment nobody named says nothing.** The sentence that wanted it is
dropped and the rest is still spoken; there is no honest way to announce an
appointment whose name has not been written, and inventing one from the file is
what this whole section forbids.

**A record says a word. It never says a sentence.** Every sentence in the
catalogue is a frame with one slot in it, and the frames are in the code, so
*Schwimmbad* and *Bouldern* are all a household ever types — once, on the card,
when the card is made. A choice appointment then needs nothing entered at all:
it offers cards, and the cards brought their word with them.

That is also what keeps a word usable in a sentence nobody has written yet. A
card offered at two and named at three is one noun in two frames; had it carried
*ins Schwimmbad gehen*, the first frame would read well and the second would say
*Jetzt ist ins Schwimmbad gehen*. Nothing catches that but an ear, which is why
the rule is on the record rather than on the frame.

**And the word is written where it can be heard.** An appointment and a card
each carry an Ansage field with a button that says it, and a fold under it
listing every sentence the word can turn up in — `couldSay`, derived from the
same frames the board speaks from rather than written out again, so a rule that
changes changes both in one commit. It is the honest preview of what recording
would ask for, too: the fixed half of every line is a clip that exists once for
everything, and only the word inside it is the household's.

There is no list until there is a word. A frame with a hole in it answers
nothing, and the field is looked at while a name is still being typed.

**The second string is an override, not a translation.** `speech` on either
record is for where the written and the spoken word come apart — a card called
*Schwimmbad Aquarena*, an appointment titled *Turnen, Halle 2* — and
it stays empty everywhere else. The board draws symbols and never a title, so a
title is free to carry what the child is not told; that is the only reason the
field exists.

**Once per series, not once per appointment.** A weekly Kita is one shape written
across a batch, so its name is typed once and reaches every record the batch
produced. The vocabulary a household ends up maintaining is its handful of
recurring appointments and its cards — not its calendar.

The derivation is [`src/announce.ts`](../src/announce.ts): one function of a week
and a moment, returning the utterances. It holds no clock of its own and touches
no DOM, so the same week can be asked what it would say at any minute — which is
how the catalogue above is tested, and what lets a day be rendered ahead of time.

## How it is spoken

**Both are assembled from fragments.** A sentence is a frame and a word, and it
is *played* as a frame and a word: one clip after the other, in the order
`announce` returns them. `Utterance.parts` is that order and `Utterance.text` is
how the same thing reads.

**Fifty-six clips exist before anything is planned**, and `vocabulary()` is the
list: every frame, plus the twenty-eight weekday-and-daypart words, which are one
clip each so that no seam ever falls inside a word. That list is what a recorder
walks. A frame written anywhere but in `FRAMES` would be a clip nobody was asked
to record — silence on the board, and nothing else to notice it — so a test
plays a whole day and fails on any fixed part that is not in the vocabulary.

**Everything else is recorded with the record it belongs to.** A card gets its
word when the card is made, a person theirs, an appointment its own where the
title is not what is said. That is the whole of the household's own vocabulary,
and it is why a new appointment speaks the moment it is saved rather than after
something has rendered.

**The seam is the price.** Concatenated clips are audible at the joins, and a
human voice varies its pitch and pace across takes more than a synthetic one
holds them — so this is worth more to a household recording itself than to one
using a synthesiser, and it is the reason the frames are written with the slot at
a natural break. Where a voice is synthesised, the same parts can be rendered as
one sentence instead and cached under its text; nothing in the derivation
changes, because it hands out both.

**Rendered when planned, played when pressed.** The calendar route knows every
sentence a week can produce, and it runs on the laptop where a key would be
typed anyway. It renders them, and the board plays files. That is exactly the
split [mitreden and vorlaut](decisions/002-browser-only-and-a-shared-folder.md)
already have — one half renders once and writes the file, the other half only
ever plays — with the shared folder of ADR 002 in place of vorlaut's cable. The
Wyse then never synthesises anything, needs no model on it, and is complete
offline.

Naming and caching are `@lautstark/stimmquelle`'s, not ours: `keyFor` hashes the
text, the voice and the output settings per `CONTRACT.md` §3, and because the
text is the key, a routine converges on cache hits within a week.

**A key, where there is one, is typed in the settings and lives in that
browser.** Never in the build — the warning in `CONTRACT.md` §8 is about a key
that ships with the page, and mitreden's settings dialog is the shape that
answers it.

## The button

A press interrupts whatever is speaking and starts again; a second press is a
repeat, not a queue.

**The card is lit for exactly as long as the sentence about it.** Every sentence
knows which appointment it is about, or that it is about none — the day sentence
is about none, and so is *danach hast du frei* — and the board follows that from
one sentence to the next: nothing, then the running card, then the one that is
coming. A card still lit under the following sentence would point at the wrong
thing, which is worse than pointing at nothing.

A ring rather than a fill, because the card's own colour is already saying
whether it is over, now or ahead and must not have to give that up. The ring is
the day's own colour darkened, the way an undecided card draws its dashed edge
and the rail draws its marks — a neutral grey belonged to nothing on a board
where every column is a colour, and read as chrome laid over the week rather
than as part of it. It breathes,
because a still outline on a board full of pictures is not what pulls a
two-year-old's eye, and it holds still for anyone whose system asks for less
motion. This is the pairing [hardware.md](hardware.md) sketches for its
information cards: a spoken cue and a temporary visual focus, together.

Build it as one function, and give the button, a keypress and a card UID the
same door. Then the *jetzt* / *heute* / *morgen* cards that hardware.md leaves
open are this mechanism with a different trigger, and the button is the version
of them that needs no card at all.

## Not settled here

Which voice. piper publishes no child voice in any language and exactly one
licence-clear German female one; Azure has a larger catalogue and needs the key
above; a parent's own recording beats both at this age. The choice is one
setting for the whole calendar — never per appointment, per card or per series —
and the play side is the same clips whichever renders them, which is why this
document does not have to choose.

Nor does it settle the information cards themselves: what is said is here, which
card says it is still hardware.md's open question.
