# UX direction

## Chosen first board layout

The prototype uses seven equal day columns and four daypart bands. This preserves a stable weekly mental map and makes today/current-time obvious without moving content. Today has a dark header; the current daypart has a quiet mint field; past columns mute. It avoids clock grids, drag handles, long text, and dashboard widgets.

Symbol cards are the content units. An unresolved choice is a warm dashed `Du wählst` state; a resolved choice keeps its selected activity and a quiet confirmation chip.

## Alternatives deferred for testing

- Day cards: clearer individual stories, but more vertical scanning.
- Today-led column: stronger `now`, but risks making the rest of the week secondary.

## Parent view

The phone mock has a simple week navigator, compact day cards, daypart rows and a choice bottom sheet. The next real interaction should be a two-tap add-entry flow, not calendar drag-and-drop.
