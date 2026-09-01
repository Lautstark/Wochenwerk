# UX decisions

## Calendar first

Parents plan real appointments with dates, times, repetition, people, symbols, and optional visibility of avatars. They do not fill abstract morning/midday/afternoon slots. The board derives its layout from those appointments.

## The whole model

The calendar resolves everything. The board receives seven concrete dates with concrete appointments — no repetition rules, no states it has to derive itself. Everything difficult (series, exceptions, moves) has already happened by the time the board renders.

A day then holds appointments, and only appointments. One kind of record, with two properties that decide how it is drawn:

1. **it has a time** — a card in the column, its height the duration;
2. **it lasts all day** — at the top of the day instead, as the people it concerns wearing the symbol it carries.

Visit and birthday are the second shape, not a second kind. A day fact with nobody on it — a holiday, a closed Kita — is the same record with a symbol and no people.

And time itself follows a single rule: over is grey, now is bright, ahead keeps its colour but stays quieter. The same rule for days and for appointments, so it has to be learned once.

## What an appointment shows, and what a card is

An ordinary appointment carries its symbols directly, and may carry a name of its own. That is everything it needs: it is written once, usually as a series, and a picture is all the board asks of it.

A choice is where that stops being enough, and the reason is physical. What may be picked is a set of cards that exist in the household — a laminated picture with an NFC tag, laid out on the table when the choice is offered. A card has a name, a symbol, something to say when it is offered, and the tag identifier the board recognises it by. So a card is a record and an appointment's symbol is not: one is an object, the other is a picture.

## One kind of timed appointment

There is no separate choice appointment. There is one appointment, and it either shows its own symbols or offers cards — in which case an input picks one. Once picked, it is an ordinary appointment and nothing about it differs.

An undecided appointment shows its options rather than a question mark, so the child sees on the board the same symbols that are on the physical cards. Its edge is dashed: the card is visibly unfinished.

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

- **over** — strongly greyed: the day colour is nearly gone, symbols stay recognisable but flat;
- **now** — full strength: the current day is at its brightest, and inside it the running appointment lifts off the board as a white card with a light halo;
- **ahead** — the weekday colour stays, but quieter than today.

There is no now line, no marker travelling down the column and no exact clock scale. The current appointment *is* the now indicator, which is the form a two-year-old can read.

When nothing is running — in the gap between two appointments, or before the day window opens — no card is highlighted. The rule still holds: the border between grey and bright simply falls between two cards, and the daypart rail keeps showing where we are.

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

What it costs: an action over a series is a bulk write, so it says how many records it will touch before it touches them — including how many carry edits of their own that it would overwrite. And "until further notice" does not exist; a batch is extended instead.

## Visual constraints

The board fills the available display. Columns touch without gaps and have no rounded outer card corners. A day header has no band of its own — day, date and, on the current day, the time sit straight on the day colour, in dark ink where the field is light and in light ink on a day that is over. Weekday colours are bold adaptations of the METACOM day colours, taken from one coherent row of the palette explorations; Saturday keeps its stone grey, warmed just enough to read as a colour rather than as a disabled state. METACOM remains the source of the child-facing symbols, used without frames and without their printed captions.
