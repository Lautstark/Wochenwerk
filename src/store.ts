import { addDays, iso, mondayOf, type Appointment, type Card, type Person, type Series, type SymbolRef } from "./model.js";
import { allCards, allPeople, allSeries, week } from "./db.js";
import { pictures } from "./symbols.js";

/* One place holds what is on screen, and the views read it rather than each
   fetching for itself. They used to reach for module-level arrays and reassign
   them from wherever, which is why a change made in one dialog was invisible in
   another until something happened to reload. */

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

const empty: Week = {
  offset: 0, monday: mondayOf(new Date()), dates: [],
  appointments: [], people: [], cards: new Map(), series: new Map(), pictures: new Map(),
};

let current: Week = empty;
const listeners = new Set<(shown: Week) => void>();

export const shown = () => current;
export function subscribe(listener: (shown: Week) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Read the week at an offset from this one and tell everybody watching. */
export async function load(offset = current.offset): Promise<Week> {
  const monday = addDays(mondayOf(new Date()), offset * 7);
  const [appointments, people, cardList, seriesList] = await Promise.all([
    week(monday), allPeople(), allCards(), allSeries(),
  ]);
  current = {
    offset, monday,
    dates: Array.from({ length: 7 }, (_, index) => iso(addDays(monday, index))),
    appointments, people,
    cards: new Map(cardList.map(card => [card.id, card])),
    series: new Map(seriesList.map(item => [item.id, item])),
    pictures: await pictures([
      ...appointments.flatMap(appointment => appointment.symbols),
      ...cardList.map(card => card.symbol).filter(Boolean) as SymbolRef[],
    ]),
  };
  listeners.forEach(listener => listener(current));
  return current;
}

export const personById = (id: string) => current.people.find(person => person.id === id);
export const cardById = (id: string) => current.cards.get(id);
