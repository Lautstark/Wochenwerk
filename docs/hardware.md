# Physical layout and failure states

Mount the 21.5-inch display on VESA hardware inside a shallow frame. Hide the Wyse and USB cable behind it but retain rear access. Place one vertical slot below the display with the ACR122U behind it and an adjustable tag-position stop. Let the card project 45–60 mm for easy removal.

Start physical testing at **85 × 120 mm** laminated cards. Place the NFC sticker at a fixed, tested location with a clear alignment mark.

- No card: retain the active-choice prompt.
- Offered card: confirm, save once, prompt removal/next choice.
- Card remains: never save twice; show a quiet removal cue.
- Unknown/non-offered card: no save, clear visual rejection.
- Reader offline: retain the week, show maintenance state, offer phone-side resolution.
- NAS offline: retain last board snapshot and show a non-alarming connection indicator.

## Special information cards (to be defined)

The system may support reserved NFC cards that ask the board for contextual information rather than changing the plan. Examples include cards for **now**, **today**, **tomorrow**, or **what is happening now**. The board could respond with a short spoken/auditory cue and/or a temporary visual focus on the relevant appointment.

These cards are intentionally not specified yet. Open questions include card identity and ownership, whether the response is audio, visual, or both, whether a card is held or tapped once, language/content of the response, accessibility timing, and how to distinguish information cards from choice cards. They must never create, move, or complete calendar appointments accidentally.
