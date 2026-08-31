# Wochenwerk requirements summary

Wochenwerk is a calendar-driven family planner. The calendar is authoritative; the weekly board is a child-friendly projection of calendar appointments. Planning supports one-time and recurring appointments, a configurable 15-minute snap grid, optional people, optional participant avatars, one or multiple METACOM symbols, choice appointments with defined options, all-day badges, and parallel appointments.

The child view must work for non-reading two- and three-year-olds: symbols first, minimal text, no adult controls, no empty-slot management, and no contradictory choice states. Appointment duration is visible through the size of the coloured surface, while symbols stay readable and moderately capped.

The prototype board is a full-screen 16:9 weekly view from 07:00 to 20:30. Seven columns touch with no gaps or rounded day-card corners. The current day is wider, shows date plus a small current time, and keeps past appointments only gently muted. A time-of-day rail sits immediately to its left using the METACOM morgens/mittags/nachmittags/abends symbols. The current period is indicated by a soft circular focus and an approximately one-hour glow, not a hard now-line.

The visual direction is dark, flat, modern, and high-contrast. Weekday colours are bold, harmonious adaptations of METACOM day colours. Activity surfaces use their day colour; there are no outlines around individual entries. Licensed METACOM assets remain local and are never committed.

## Future NFC information cards (open requirement)

In addition to activity/choice cards, the system may support special NFC cards that request context from the board: current time/day, today, tomorrow, or the appointment happening now. The response may be spoken, visual, or both. The interaction model and card identities are still to be defined. Information cards are read-only queries and must never mutate the calendar.
