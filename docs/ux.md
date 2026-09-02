# UX decisions

## Calendar first

Parents plan real appointments with dates, times, repetition, people, symbols, and optional visibility of avatars. They do not fill abstract morning/midday/afternoon slots. The board derives its layout from those appointments.

## The whole model

The calendar resolves everything. The board receives seven concrete dates with concrete appointments — no repetition rules, no states it has to derive itself. Everything difficult (series, exceptions, moves) has already happened by the time the board renders.

A day then holds appointments, and only appointments. One kind of record, with two properties that decide how it is drawn:

1. **it has a time** — a card in the column, its height the duration;
2. **it lasts all day** — at the top of the day instead, as one pill carrying its symbol and, beside it, the people it concerns.

Visit and birthday are the second shape, not a second kind. A day fact with nobody on it — a holiday, a closed Kita — is the same record with a symbol and no people, and it is the same pill with the symbol standing alone in it.

One pill per all-day appointment rather than one stack for the day: two of them stay countable at the top of the day the way two cards stay countable in the column. The pill is the same light surface as a card, so the head of the day is made of the same material as the day below it. It carries at most one picture — a row of symbols beside a row of avatars would be two lists in something too small to read as two — and a crown sits on whoever has a birthday that day.

And time itself follows a single rule: over is grey, now is bright, ahead keeps its colour but stays quieter. The same rule for days and for appointments, so it has to be learned once.

## What an appointment shows, and what a card is

An ordinary appointment carries its symbols directly, and may carry a name of its own. That is everything it needs: it is written once, usually as a series, and a picture is all the board asks of it.

A choice is where that stops being enough, and the reason is physical. What may be picked is a set of cards that exist in the household — a laminated picture with an NFC tag, laid out on the table when the choice is offered. A card has a name, a symbol, something to say when it is offered, and the tag identifier the board recognises it by — or several of them, where the same card exists twice in the household. So a card is a record and an appointment's symbol is not: one is an object, the other is a picture.

## One kind of timed appointment

There is no separate choice appointment. There is one appointment, and it either shows its own symbols or offers cards — in which case an input picks one. Once picked, it is an ordinary appointment and nothing about it differs.

An undecided appointment is a question mark, and under it, small and muted, the
cards that would answer it. The mark is the sign to learn — one shape, in the
day's own ink, drawn rather than fetched so the day can colour it. The row
beneath is what is lying on the table, quiet enough that nobody mistakes it for
what is happening: those are not two appointments, they are two answers nobody
has given yet.

It used to show the options at full size and nothing else, which made a card that
was a different sign every time. Afterwards it is what was picked, at full size
like any other appointment.

Its edge is dashed, and its ground is the day's colour rather than paper. That
inverts the board's own rule — colour is the field, paper is a card — for the one
card that is a question rather than an event, which is what keeps its symbol from
reading as one more thing that happens.

The four choice states of the domain model (`draft`, `available`, `active`, `resolved`) are parent-side. The board only ever sees open or decided.

## Rendering rules

- treat the configured day window as a floor, not a frame: it is stretched to the full hour when the week contains something earlier or later, and never made smaller, so nothing can fall outside the column and the scale stays stable in a normal week (prototype floor: 07:00–20:30);
- snap appointment starts and ends to the planning grid (prototype: 15 minutes);
- map duration to card height exactly, with no minimum — one grid step is the smallest card;
- subtract the gap between cards in pixels, so it never distorts the time scale;
- place multiple symbols side by side;
- give parallel appointments lanes across the width of the day, and let those lanes overlap slightly so two side by side stay wide enough to carry a symbol;
- keep people hidden unless an appointment explicitly asks for them;
- clip appointments to the day window — the child board has no appointments across midnight.

## Colour and card

Each day is a solid field of its weekday colour and each appointment is a light card on that field. Colour carries the day, cards carry what happens, and the gap between two cards is day colour rather than empty space — so appointments are always countable and never fuse into one surface.

## Was war, was ist, was kommt

The board answers those three questions with colour alone, and it answers them the same way at both scales — across the week and inside the current day:

- **over** — the pale end of the day's own colour, sixteen per cent of it, so a day that is behind us is a washed-out version of itself rather than a different colour. What lies on it fades with it: the cards give up their white and lie as a barely tinted plate on a barely tinted field, held apart from it by a rim. A day that is over is *one surface*; a day that is ahead is a field with cards on it. That difference reads across a room, where a difference in brightness alone did not — the cards are the largest bright surface a day has, and while they stayed white a Monday stayed loud however pale its ground;
- **now** — full strength: the current day is at its brightest, and inside it the running appointment lifts off the board as a white card, shadowed onto the field and framed in the day's own colour at full strength. The frame is drawn inside the card and scales with its height, so a quarter of an hour is framed thinly rather than filled in, and the gap that keeps two appointments countable stays day colour;
- **ahead** — seven eighths of the weekday colour: quieter than today, and still a field with white cards on it.

All three are one scale of one colour rather than three recipes, and all three mix towards the same cool light. That is what keeps the answer to *was war* the same at both scales: a day that is over looks like the hours of today that are over, because it is made the same way.

There is no now line, no marker travelling down the column and no exact clock scale. The current appointment *is* the now indicator, which is the form a two-year-old can read.

When nothing is running — in the gap between two appointments, or before the day window opens — no card is highlighted. The rule still holds: the border between grey and bright simply falls between two cards, and the daypart rail keeps showing where we are.

## The choice at the slot

A choice is answered with a physical card, and the card goes into a slot built into the frame below the display. That slot never moves, so the place on screen that speaks for it may not move either: the cards a question offers stand on a tray at the bottom edge of the picture, centred over the slot, whatever day the question belongs to. An earlier draft put them under their own day's column and read better on screen — and would have taught an address that does not exist in the room.

Which day is being decided is then carried by colour and by nothing else: the tray is a plate of that day's own colour, and no two columns share one. A drawn line was tried and dropped. It would have had to cross half the board, and where the day is the one the slot already stands under it would have had nothing to cross at all — a pointer that degenerates exactly where it is needed is worse than no pointer.

The tray shows the next undecided choice whose appointment is today or tomorrow, one at a time. The calendar day is the boundary rather than twenty-four hours: a day turns at midnight and unobserved, where a rolling window would make a question appear in the middle of an afternoon for a reason nobody in the room can see. There is no bar and no reserved row — the tray lies over the week, so a question appearing moves nothing.

**The card in the slot is the answer**, for as long as it lies there. Taking it out takes the answer back, up until the appointment begins; from then on it is not a plan any more but what is happening, and the board keeps it. Otherwise an afternoon that was ridden through would turn back into a question the moment the card was tidied away, and next week's board would show a question mark over a day that no longer had one.

Four things the slot says, and it says them at the slot:

- a card that answers the question: it is written once, the tray goes, and the bottom edge flares in the day's colour above the slot;
- the same card taken back before the appointment began: the same flare running the other way, and the question standing there again;
- a card that answers nothing: nothing is written, the tray turns red and shakes once, and the board says out loud what is not on offer and what would be instead — built from what each card was given to say;
- no reader at all: everything stays exactly as it is, and a quiet grey line at the bottom left says the reader does not answer. No card is inferred to have been removed, because a reader that is gone and a card that is gone look identical from the browser and mean opposite things.

## Daypart rail

A narrow strip immediately left of the current day. It also carries how far the day has come: the part already behind us is washed out the way a finished appointment is, the part from now on carries the current day's own colour, and the two meet at the current minute with a soft edge rather than a line. The edge follows the clock unsnapped, so it moves every minute rather than every grid step, and is clamped when the time is outside the day window.

The strip carries four flat marks drawn from the METACOM daypart symbols: the three sun marks follow the same dotted arc as METACOM's mittags/nachmittags and differ only in where the sun stands on it, the fourth is the evening moon. Drawn marks rather than symbol pictures, so the rail reads as an icon family and never competes with the appointment symbols. They are a single dark tint of the day colour, because both halves of the strip are light — a light mark would disappear on the yellow and stone days. The current daypart is the only one at full size and full opacity.

## People

An appointment may carry people, and may or may not show them. Where it does, they appear as stacked circles in the top right corner of the card — a photo where there is one, the person's initials otherwise. Three avatars is what a narrow column can carry; beyond that the rest becomes a count.

## Repetition

A repetition is a way of writing many appointments at once, never a rule stored instead of them. Creating one asks for a pattern and where it stops — a date, or a number of times — and writes exactly that many concrete appointments.

An appointment written once that turns out to repeat is turned into a batch from the same fields, as long as it does not already belong to one: the record it already is becomes the first of the batch, so a choice resolved on it stays resolved and the copies start undecided. What already belongs to a batch is never turned into a second one; there, the same fields change the rule it already has.

The rule itself can be changed afterwards — which days the batch falls on, and where it stops — in the same row it was asked for in. A new rule holds from the appointment it was changed on and never from earlier than today: what is already behind is what was planned, and it stays. The batch record's start moves to the day its current rule begins, so no later change reaches back over that part either, while the appointments there keep the batch id and stay listable with the rest. Days that survive the change keep their records untouched, edits and resolved choices and all. Days that are new are written from the appointment in front of whoever made the change, not from the first of the batch. Days that fall away are removed, and how many of them carried something of their own is said before it happens.

Each carries the id of the batch it came from. That is what makes a series listable, extendable and clearable, and it is all the series is for: the appointments stand on their own, and the board never sees it.

Everything that is otherwise hard falls out of this. A Kita day that falls away is one record deleted. A choice resolved on Monday is written to Monday's own record and does not follow the child to Tuesday. Last month's board keeps showing what was actually planned, because nothing is derived.

**A stretch of days is not a repetition, and is not asked about as one.** Both are one batch of one record per day, and the board puts a stretch back together into one bar — but a holiday does not recur, it lasts, and „Alle Termine der Serie" about four days away from home asks somebody to think of their holiday as a rule. A daily batch of all-day appointments is therefore asked about in its own words: *Mehrtägiger Termin*, *Nur diesen Tag*, *Alle Tage des Zeitraums*. Nothing distinguishes „von Montag bis Freitag" from „jeden Tag, bis Freitag" once either is written, and nothing needs to — they are the same five days.

The middle answer is offered only where it is a third answer. Standing on the first day of a batch, „diesen und alle folgenden" reaches everything and „alle" reaches the same number; standing on the last, it reaches one. Either way it was the same answer under a second name, with the same count printed beside both — and the first day is where somebody almost always is, because it is where the bar starts and where the sheet is opened from.

The day is the exception to all of it. Which days a batch falls on is what its rule says, so moving an appointment moves that one appointment, whatever scope the change is given — and the question that asks for the scope says so, and says where the rule is instead.

What it costs: an action over a series is a bulk write, so it says how many records it will touch before it touches them — including how many carry edits of their own that it would overwrite. And "until further notice" does not exist; a batch is extended instead.

## Visual constraints

The board fills the available display. Columns touch without gaps and have no rounded outer card corners. A day header has no band of its own — day, date and, on the current day, the time sit straight on the day colour, in dark ink, because every field is now a light one.

The seven weekday colours are one family rather than seven decisions: they sit at roughly the same lightness and carry roughly the same amount of colour, which is what lets seven of them stand side by side without competing for the same attention. Two leave the family together and on purpose — Saturday is nearly white and Sunday a light rose — so the weekend reads as one pair against five working days rather than as two more appointments. Thursday and Sunday are parted the way METACOM parts them, a full red against a pale rose, because their hues alone sit too close to tell apart.

Where these sit against the METACOM day cards is an open question and worth watching in use: green and blue here are a jade and a sky rather than the leaf green and the periwinkle the cards teach, which is a difference the child may or may not carry between the two.

Everything mixes towards a single cool light. Before, a field went eighteen per cent into a warm near-black and everything spent went into a warm grey: two warm neutrals, two directions, and every hue turned muddy somewhere along the way. Damping a palette made that worse rather than better, because what looked dirty was never the hue. METACOM remains the source of the child-facing symbols, used without frames and without their printed captions.

## Der ganze Bildschirm

The board fills the display it is on, and on the wall it is given the whole of one: the Wyse starts Chromium in kiosk, so there is no chrome to be rid of and nothing to ask for. Everywhere the board is only tried out, a window's address bar sits over the week, and the height it takes is the height today's last appointment loses — and the tray under it. So the board is measured against the dynamic viewport height rather than the large one; under kiosk the two are the same number anyway.

`Ctrl+Shift+F` hands it the screen there, and gives it back. That is for whoever is trying the board out and for nobody else, which is why it carries modifiers. The board's own key is Space and it ignores anything modified, on the grounds that a modifier means somebody is at a real keyboard doing something else — this is that somebody, and a bare letter would be standing in the way of whatever unmodified key the board binds next. It answers to the mute key as well, because the button in front of the board is a USB volume dial that cannot send anything else, and it swallows volume up and down so that turning the dial does nothing at all: the volume of a talking board is not a setting a two-year-old should reach by leaning on it. See [hardware.md](hardware.md).

While the board has the whole screen it also keeps it lit. Only then: in a window among other windows the board is being worked on rather than hung up, and it has no business keeping that machine awake.
