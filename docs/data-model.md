# Minimal domain model

> **Outdated relative to the calendar model.** This table still describes ordered
> entries inside named dayparts (`Daypart`, `ScheduleEntry.daypartId/position`),
> while [product](product.md) and [UX](ux.md) have moved to real appointments with a
> start and an end on a 15-minute grid. `Daypart` survives only as the four symbols
> of the board's time rail. Rework the entry records before the first write path is
> built. The notes below say what happens to the rest of the table.
>
> `Choice` is no longer a separate kind of entry either: an appointment's symbol is
> either fixed or undecided, and `ChoiceOption` becomes the option set hanging off an
> undecided appointment. The four choice states stay parent-side; the board only ever
> sees open or decided.
>
> `PhysicalCard` and `ChoiceOption.physicalCardId` are on the wrong side of the
> line. An input picks one of the options an appointment offers; the option
> carries a symbol and may carry something spoken. Which tag UID means which
> option is configuration of the reader, not of the appointment — see
> [ADR 002](decisions/002-browser-only-and-a-shared-folder.md). Moving it there is
> what lets a tap or a key resolve a choice as well as a card, and what lets the
> board run with no reader attached.
>
> `Symbol.source` stays, but it changes nothing about how a symbol is stored or
> shared: an appointment names its symbol the same way whether it came from
> ARASAAC or from the household's METACOM folder, and that name goes in the
> shared folder either way — see
> [ADR 002](decisions/002-browser-only-and-a-shared-folder.md). The files of a
> licensed collection, an index of one and a count of it never travel; a
> reference does.
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
