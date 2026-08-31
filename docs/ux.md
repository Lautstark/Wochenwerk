# UX decisions

## Calendar first

Parents plan real appointments with dates, times, repetition, people, symbols, and optional visibility of avatars. They do not fill abstract morning/midday/afternoon slots. The board derives its layout from those appointments.

## The whole model

The calendar resolves everything. The board receives seven concrete dates with concrete appointments — no repetition rules, no states it has to derive itself. Everything difficult (series, exceptions, moves) has already happened by the time the board renders.

A day then holds exactly two things:

1. **an appointment with a time** — a card in the column, its height the duration, carrying one or more symbols and optionally people;
2. **an entry without a time** — an avatar at the top of the day, exactly one person, with or without a crown.

And time itself follows a single rule: over is grey, now is bright, ahead keeps its colour but stays quieter. The same rule for days and for appointments, so it has to be learned once.

## One kind of timed appointment

There is no separate choice appointment. There is one appointment, and its symbol is either fixed or not decided yet — in which case it carries the options its parents allow, and the NFC slot picks one. Once picked, it is an ordinary appointment and nothing about it differs.

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

## Visit and birthday

Both belong to whole days rather than to a time, and both are shown as the person they concern at the top of the day, not as an appointment symbol. One person per entry: two guests are two visits. A visit that runs over several days shows its avatar on every day it covers. A birthday adds a small crown above the avatar.

## Visual constraints

The board fills the available display. Columns touch without gaps and have no rounded outer card corners. A day header has no band of its own — day, date and, on the current day, the time sit straight on the day colour, in dark ink where the field is light and in light ink on a day that is over. Weekday colours are bold adaptations of the METACOM day colours, taken from one coherent row of the palette explorations; Saturday keeps its stone grey, warmed just enough to read as a colour rather than as a disabled state. METACOM remains the source of the child-facing symbols, used without frames and without their printed captions.
