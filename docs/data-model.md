# Minimal domain model

> **Outdated relative to the calendar model.** This table still describes ordered
> entries inside named dayparts (`Daypart`, `ScheduleEntry.daypartId/position`),
> while [product](product.md) and [UX](ux.md) have moved to real appointments with a
> start and an end on a 15-minute grid. `Daypart` survives only as the four symbols
> of the board's time rail. Rework the entry records before the first write path is
> built; the choice, card and session records below are unaffected.
>
> `Choice` is no longer a separate kind of entry either: an appointment's symbol is
> either fixed or undecided, and `ChoiceOption` becomes the option set hanging off an
> undecided appointment. The four choice states stay parent-side; the board only ever
> sees open or decided.
>
> Still missing entirely: a `Person` record (initials, optional photo, tone) with an
> appointment link and a per-appointment `showPeople` flag, and a whole-day `Special`
> record for visit and birthday — one person per entry, with a date range, so a visit
> can cover several days.

| Record | Essential fields | Purpose |
| --- | --- | --- |
| `Daypart` | id, label, order, startTime | Household configuration. |
| `Symbol` | id, source, key, label, localAssetPath | Keeps assets decoupled from logic. |
| `ScheduleEntry` | id, date, daypartId, position, kind, symbolId, label | Ordered fixed/choice entry. |
| `Choice` | entryId, prompt, status, selectedOptionId, openedAt | `draft`, `available`, `active`, `resolved`. |
| `ChoiceOption` | id, choiceId, position, symbolId, label, physicalCardId? | Parent-defined allowed choice. |
| `PhysicalCard` | id, nfcUid, symbolId, label | Household mapping; UID unique. |
| `BoardSession` | activeChoiceId?, lastCardUid?, updatedAt | One active choice at a time. |

On card detection, the server atomically checks that its UID belongs to an option of the active choice, resolves once, and emits a change. Unknown, non-offered, duplicate, or still-present cards never modify the plan.
