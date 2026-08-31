# Wochenwerk product requirements

## Core model

The adult-facing administration is a calendar of appointments. The child-facing board is a visualisation of that calendar; it is not a separate routine editor or a collection of manually filled day slots. The calendar resolves everything before the board renders: the board receives seven concrete dates with concrete appointments and derives no state of its own.

A day holds appointments, and only appointments. One kind of record: it either has a time or lasts all day, and its symbol is either fixed or still to be chosen.

**An appointment with a time** has a start and an end on a configurable planning grid (currently 15 minutes). The board displays a configurable visible day range, currently a floor of 07:00–20:30 that stretches when a week contains something earlier or later. Duration is visualised by the height of the card, exactly and without a minimum. Appointments that run in parallel share the width of the day in lanes.

There is only one kind of them. An appointment's symbol is either fixed or not decided yet; in the second case it carries the options its parents allow, shows those options on the board, and the NFC slot picks one. A decided choice is an ordinary appointment.

An appointment may have zero or more people assigned. People are not shown by default; the appointment can opt into showing participant avatars, which are photos or initials. Multiple METACOM symbols assigned to one appointment are arranged horizontally in the same card.

**An appointment that lasts all day** appears at the top of the day rather than in the column, as the people it concerns wearing the symbol it carries. Visit and birthday are that shape — a guest is a person with no symbol, a birthday a person with the birthday symbol — and so is a holiday, which is a symbol with nobody on it.

**Repetition writes appointments; it does not replace them.** Planning a recurring appointment asks for a pattern and where it stops, and writes that many concrete appointments at once. They carry the id of the batch so it can be listed, extended and cleared together, but each stands on its own: a single day can be changed or dropped without the others noticing, and what was planned last month stays what last month showed.

## Child board

The board is designed for children aged two to six and viewed from across a room. It uses licensed METACOM symbols with as little text as possible. The week remains visible as seven uninterrupted day columns. The current day is wider and clearer; other days are muted but still legible. The current date and a small current time appear in the current-day header.

Each day is a solid field of its weekday colour, and each appointment is a light card on that field. The gap between two cards is day colour, so appointments are always countable and never fuse into one surface. Card height carries duration exactly; one grid step is the smallest card.

Colour answers what was, what is and what comes, at both scales: past days and finished appointments are strongly greyed, the current day and the running appointment are at full strength, everything ahead keeps its weekday colour but stays quieter than today.

The four METACOM time-of-day symbols (morgens, mittags, nachmittags, abends) form a narrow rail directly beside the current day, redrawn as flat white icons so they never compete with the appointment symbols. Now is carried by the appointments themselves: the running one lifts off the board. There is no now line and no clock grid.

The visual system is flat and modern: no rounded day cards, no gaps between columns, no dashboard chrome, no bottom tray, no legend, and no instructional text. Wochentag colours are bold but harmonious, with the current day most prominent.

## Current example data

Weekdays include breakfast, getting ready, leaving for Kita, Kita (08:45–14:00), free afternoon, cooking, dinner, and evening routine. Saturday and Sunday include open choice appointments. Testperson has speech therapy Tuesday 11:00–11:45 and Thursday 11:00–11:45, followed by early intervention Thursday 12:00–13:15.
