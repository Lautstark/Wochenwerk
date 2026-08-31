# Minimal domain model

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
