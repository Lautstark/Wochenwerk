# Physical layout and failure states

Mount the 21.5-inch display on VESA hardware inside a shallow frame. Hide the Wyse and USB cable behind it but retain rear access. Place one vertical slot below the display with the ACR122U behind it and an adjustable tag-position stop. Let the card project 45–60 mm for easy removal.

Start physical testing at **85 × 120 mm** laminated cards. Place the NFC sticker at a fixed, tested location with a clear alignment mark.

- No card: retain the active-choice prompt.
- Offered card: confirm, save once, prompt removal/next choice.
- Card remains: never save twice; show a quiet removal cue.
- Unknown/non-offered card: no save, clear visual rejection.
- Reader offline: retain the week, show maintenance state, offer phone-side resolution.
- NAS offline: retain last board snapshot and show a non-alarming connection indicator.
