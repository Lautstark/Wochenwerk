# Physical layout and failure states

Mount the 21.5-inch display on VESA hardware inside a shallow frame. Hide the Wyse and USB cable behind it but retain rear access. Place one vertical slot below the display with the ACR122U behind it and an adjustable tag-position stop. Let the card project 45–60 mm for easy removal.

Start physical testing at **85 × 120 mm** laminated cards. Place the NFC sticker at a fixed, tested location with a clear alignment mark.

- No card: the question stands — as a mark in the day's own column, and as a tray of the cards it offers, over the slot.
- Offered card: written once; the tray goes and the bottom edge flares in the colour of the day it answered.
- Card remains: nothing further happens. It *is* the answer for as long as it lies there.
- Card taken back before the appointment begins: the answer is withdrawn and the question stands again, with the same flare running the other way. From the moment the appointment begins, removal changes nothing — what happened, happened.
- Unknown/non-offered card: no save; the tray turns red and shakes once, and the board says what is not on offer and what would be instead.
- Reader offline: the week and every answer stay exactly as they are, and a quiet line says the reader does not answer. Nothing is inferred to have been removed.
- NAS offline: retain last board snapshot and show a non-alarming connection indicator.

## The button that asks for the announcement

It is a USB volume dial: an aluminium knob that sends the system's mute key when
it is pressed and volume up and down when it is turned. Not what anybody would
specify for a child's board — the right thing is a wide AAC switch that sends
whatever key it is told to — but it is what hangs there, it costs fourteen euros,
and it presses like a doorbell. The board was made to fit it rather than the
other way round, because the dial cannot be reconfigured at all: it ships with no
software, and "customisable" on its packaging means the operating system decides
what its keys do.

So the board answers to `AudioVolumeMute` beside `Space`, and swallows
`AudioVolumeUp` and `AudioVolumeDown` — turning the dial does nothing, on the
grounds that the volume of a talking board is not a setting a two-year-old should
reach by leaning on it. That holds only where the browser is asked first.
**macOS is where it is not:** the driver acts on these keys and Chromium never
sees them, which is why the dial mutes a Mac and leaves the board silent. Under
Chromium in kiosk there is no desktop above the browser to take them first, which
is the arrangement the wall already has. Where a machine does take them anyway,
the remedy is a key remapper on that machine — mute to space — and not a second
answer in the page.

## How the reader reaches the browser

The design above rests on *presence*, not on taps: a card lying in the slot is the answer, and taking it out withdraws it while the appointment is still ahead. That needs two messages, card-there and card-gone, and only one kind of reader gives both.

The ACR122U does, natively: in its ordinary PC/SC mode `SCardGetStatusChange` reports arrival and departure continuously, and the UID comes from the pseudo-APDU `FF CA 00 00 00`. No browser speaks PC/SC, so a small process on the same machine does the speaking and pushes what it sees down a one-way stream to the page: `tools/leser.py`, standard library only, no package and no build.

Two browser-native routes were considered and dropped. A reader in HID keyboard mode types the UID and can never say that the card was taken away. Web Serial and WebUSB can both reach a device directly, but both are gated on a user gesture and a per-origin permission — the wrong dependency for an appliance that has to come up on its own after a power cut, with no mouse in the room. A localhost stream asks nobody for anything, and it makes *reader offline* fall out for free: the connection drops, and the board knows.

Debouncing belongs in the bridge, where the polling is: a single missed read must never arrive at the board as a removal.

## Special information cards (to be defined)

The system may support reserved NFC cards that ask the board for contextual information rather than changing the plan. Examples include cards for **now**, **today**, **tomorrow**, or **what is happening now**. The board could respond with a short spoken/auditory cue and/or a temporary visual focus on the relevant appointment.

These cards are intentionally not specified yet. Open questions include card identity and ownership, whether the response is audio, visual, or both, whether a card is held or tapped once, language/content of the response, accessibility timing, and how to distinguish information cards from choice cards. They must never create, move, or complete calendar appointments accidentally.
