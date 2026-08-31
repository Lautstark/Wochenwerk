# Product scope

Wochenwerk answers: **what day is it, where are we in the day, what happens now, and what is coming soon?** It is a visual weekly planner, not a routine, chore, reward, completion, or adult-calendar product.

## Decisions for V1

- Use calendar dates rather than stored `Week` objects; parents can plan any week.
- Start with four household-configured dayparts: morning, midday, afternoon, evening. Their boundaries derive the `now` state.
- A daypart contains an ordered list of entries. Target three visible symbol cards; test four only as overflow.
- A choice is an entry with parent-defined allowed options. It can be scheduled in advance and explicitly opened from the parent UI. One physical slot resolves the currently active choice, then the card is removed for the next one.
- The full week stays visible. Today and the current daypart are strong; past content is muted, not hidden.
- Symbols lead, with optional short labels to disambiguate and support parents.

## Questions for the real-monitor session

1. Are three cards per daypart recognisable across the room? If not, cap at two plus a calm count.
2. Is the equal seven-column overview preferable to a today-led view?
3. Do the proposed boundaries (06:00 / 11:30 / 14:30 / 18:00) feel right in the household?
4. Are labels also needed on physical cards?

## Symbol assets

The prototype deliberately uses emoji. The future model uses an abstract `Symbol` mapping (`source`, `key`, `localAssetPath`, `label`), so licensed METACOM files can remain local and uncommitted.
