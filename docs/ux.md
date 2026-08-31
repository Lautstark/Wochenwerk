# UX decisions

## Calendar first

Parents plan real appointments with dates, times, repetition, people, symbols, and optional visibility of avatars. They do not fill abstract morning/midday/afternoon slots. The board derives its layout from those appointments.

## Rendering rules

- snap appointment starts and ends to 15 minutes;
- use a configurable visible range (prototype: 07:00–20:30);
- map duration to surface size, with a moderate symbol-size cap;
- place multiple symbols side by side;
- split overlapping participants horizontally only where needed;
- keep people hidden unless an appointment explicitly requests an avatar;
- show only the currently relevant choice as an open choice state;
- show a small all-day badge above the timed calendar.

## Current-time cue

The current day is approximately twice as wide. Its adjacent time rail contains the four METACOM daypart symbols. The active symbol receives a soft circular halo, and the current day contains a diffuse one-hour light area. There is no red “now” line and no exact clock scale on the child board.

## Visual constraints

The board fills the available display. Columns touch without gaps and have no rounded outer card corners. The dark ground and bold weekday colours are inspired by the Lautstark design language, while METACOM remains the source of the child-facing symbols.
