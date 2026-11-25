import { addDays, iso, mondayOf, type Appointment, type Card, type Person, type Series, type SymbolRef } from "./model.js";
import { allCards, allPeople, allSeries, week } from "./db.js";
import { pictures } from "./symbols.js";

/* One place holds what is on screen, and the views read it rather than each
   fetching for itself. They used to reach for module-level arrays and reassign
   them from wherever, which is why a change made in one dialog was invisible in
   another until something happened to reload.

   A rune rather than a subscriber list: whatever reads `shown()` while it
   draws is redrawn when `load()` replaces the week, and nothing has to sign
   up for that. `$state.raw`, because the week is replaced whole and never
   edited in place — and because a dialog copies an appointment out of it with
   structuredClone(), which a deep proxy cannot be. */

export interface Week {
  offset: number;
  monday: Date;
  dates: string[];
  appointments: Appointment[];
  people: Person[];
  cards: Map<string, Card>;
  series: Map<string, Series>;
  pictures: Map<string, string>;
}

/* The week before anything is read is this week with nothing in it — its seven
   dates included. The page is mounted before the first `load()` has answered,
   and on a phone it draws `dates[day]` straight away: with no dates that was
   `undefined`, the first render threw, the boot stopped at `mount` and the
   calendar stayed blank for good. An empty week is still seven days long. */
const sevenFrom = (monday: Date) => Array.from({ length: 7 }, (_, index) => iso(addDays(monday, index)));
const thisMonday = mondayOf(new Date());
const empty: Week = {
  offset: 0, monday: thisMonday, dates: sevenFrom(thisMonday),
  appointments: [], people: [], cards: new Map(), series: new Map(), pictures: new Map(),
};

let current = $state.raw<Week>(empty);

export const shown = (): Week => current;

/* Which `load()` is the latest. A week stepped away from may still be resolving
   its pictures, and it must not draw them — or itself — over the one now shown. */
let asked = 0;

/** Read the week at an offset from this one and tell everybody watching. */
/* Twice: once with the pictures already known, so the week is on screen as soon
   as IndexedDB has answered, and once more when the rest are resolved. Waiting for
   the pictures first meant that with METACOM connected as a ZIP the first picture
   unpacked the whole archive while the page showed an empty week. ADR 004. */
export async function load(offset = current.offset): Promise<Week> {
  const mine = ++asked;
  const monday = addDays(mondayOf(new Date()), offset * 7);
  const [appointments, people, cardList, seriesList] = await Promise.all([
    week(monday), allPeople(), allCards(), allSeries(),
  ]);
  if (mine !== asked) return current;
  current = {
    offset, monday,
    dates: sevenFrom(monday),
    appointments, people,
    cards: new Map(cardList.map(card => [card.id, card])),
    series: new Map(seriesList.map(item => [item.id, item])),
    pictures: current.pictures,
  };
  const found = await pictures([
    ...appointments.flatMap(appointment => appointment.symbols),
    ...cardList.map(card => card.symbol).filter(Boolean) as SymbolRef[],
  ]);
  if (mine === asked) current = { ...current, pictures: found };
  return current;
}

export const personById = (id: string) => current.people.find(person => person.id === id);
export const cardById = (id: string) => current.cards.get(id);
