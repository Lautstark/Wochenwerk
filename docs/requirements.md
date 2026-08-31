# Wochenwerk requirements summary

Wochenwerk is a calendar-driven family planner. The calendar is authoritative and resolves everything before the board renders; the weekly board is a child-friendly projection of seven concrete dates and derives no state of its own.

A day holds exactly two things. Appointments with a time support one-time and recurring planning, a configurable snap grid (currently 15 minutes), optional people, optional participant avatars as photo or initials, one or multiple METACOM symbols, and parallel appointments. There is only one kind of them: an appointment's symbol is either fixed or not decided yet, and an undecided one carries the parent-defined options that the NFC slot picks from. Entries without a time are visit and birthday — one person each, possibly spanning several days.

The child view must work for non-reading two- to six-year-olds: symbols first, minimal text, no adult controls, no empty-slot management, and no contradictory choice states. Appointment duration is visible through the height of the card, mapped exactly and without a minimum; one grid step is the smallest card.

The prototype board is a full-screen 16:9 weekly view over a configurable window, currently a floor of 07:00 to 20:30 that stretches to the full hour when the week contains something earlier or later, and is never made smaller. Seven columns touch with no gaps or rounded day-card corners. The current day is wider and carries day, date and a small current time in one header row. Parallel appointments share the width of the day in lanes that may overlap slightly, so two side by side stay wide enough to carry a symbol. A daypart rail sits immediately to the left of the current day, in that day's colour, carrying four flat white icons drawn from the METACOM morgens/mittags/nachmittags/abends symbols. There is no now-line and no clock grid.

Colour carries time at both scales: past days and finished appointments are strongly greyed, the current day and the running appointment are at full strength, everything ahead keeps its weekday colour but stays quieter than today. The running appointment is the now indicator.

The visual direction is flat, modern, and high-contrast. Each day is a solid field of its weekday colour, taken as bold, harmonious adaptations of the METACOM day colours; appointments are light cards on that field, separated by visible day colour, with no outlines around individual entries. Licensed METACOM assets remain local and are never committed; the board uses the unframed symbol set, without the printed captions.

## Future NFC information cards (open requirement)

In addition to activity/choice cards, the system may support special NFC cards that request context from the board: current time/day, today, tomorrow, or the appointment happening now. The response may be spoken, visual, or both. The interaction model and card identities are still to be defined. Information cards are read-only queries and must never mutate the calendar.
