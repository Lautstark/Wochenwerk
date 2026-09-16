/* What the board draws, worked out from one moment against one week — and
   nothing about how it is drawn. Board.svelte is the drawing; this is the
   arithmetic behind it, kept apart so that it stays a function of `at`. */
import { addDays, allDay, birthdayName, board, iso, minute, mondayOf, reading, drawnSymbols, runsOf, snapped, undecided,
  daypartTimes, type Appointment, type Card, type Person, type Run, type SymbolRef } from "../model.js";
import { allCards, allPeople, allSeries, week } from "../db.js";
import { owed, pictures } from "../symbols.js";

/* The board has no planning logic. It reads the week the calendar wrote and draws
   it; the only thing it would ever write is the option an input picked. */

let opens = snapped(board.from), closes = snapped(board.to);
const first = () => opens, span = () => closes - opens;
/* The configured window is a floor, not a frame: a week that starts earlier or ends
   later stretches it to the full hour, so an appointment can never fall outside the
   column. It is never made smaller, so the scale stays stable in a normal week. */
function scale(appointments: Appointment[]) {
  const times = appointments.filter(appointment => !allDay(appointment)).flatMap(appointment => [snapped(appointment.start!), snapped(appointment.end!)]);
  const from = snapped(board.from), to = snapped(board.to);
  const earliest = Math.min(from, ...times), latest = Math.max(to, ...times);
  opens = earliest < from ? Math.floor(earliest / 60) * 60 : from;
  closes = latest > to ? Math.ceil(latest / 60) * 60 : to;
}
export const pos = (time: string) => ((snapped(time) - first()) / span()) * 100;
/* How far the day has come, as a bare number of percent: the rail draws its edge
   from it, and today's own field draws the same edge from the same number, so the
   two can never disagree about where now is. Read unsnapped, so the edge moves every
   minute rather than every grid step, and clamped for times outside the day window. */
export const reached = (time: string) => Math.max(0, Math.min(100, ((minute(time) - first()) / span()) * 100));

/* Overlapping appointments share the width of the day for as long as they run in
   parallel. Everything that overlaps directly or through a neighbour forms one
   cluster and is laid out over the same number of lanes. */
export type Placed = { appointment: Appointment; top: number; height: number; lane: number; lanes: number };
export function place(appointments: Appointment[]): Placed[] {
  const placed: Placed[] = [...appointments]
    .sort((a, b) => snapped(a.start!) - snapped(b.start!) || snapped(b.end!) - snapped(a.end!))
    .map(appointment => ({ appointment, top: pos(appointment.start!), height: pos(appointment.end!) - pos(appointment.start!), lane: 0, lanes: 1 }));
  let cluster: Placed[] = [], ends: number[] = [], clusterEnd = -Infinity;
  const close = () => {
    const lanes = cluster.reduce((most, item) => Math.max(most, item.lane + 1), 1);
    cluster.forEach(item => { item.lanes = lanes; });
    cluster = []; ends = []; clusterEnd = -Infinity;
  };
  placed.forEach(item => {
    const start = snapped(item.appointment.start!), end = snapped(item.appointment.end!);
    if (start >= clusterEnd) close();
    const free = ends.findIndex(taken => taken <= start);
    item.lane = free === -1 ? ends.length : free;
    ends[item.lane] = end;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, end);
  });
  close();
  return placed;
}

/* What the slot bar carries: the next undecided choice whose day is today or
   tomorrow. Never one further off — a question pointed at the slot is an invitation
   to put a card in, and on Friday morning that invitation would be wrong about
   Sunday. The calendar day is the boundary rather than twenty-four hours, because a
   day turns at midnight and unwatched, where a rolling window would make the bar
   fill up in the middle of an afternoon for no reason anybody in the room can see.

   One at a time, and today's before tomorrow's: two boxes would need two arrows,
   and the second question is not being asked yet. A choice whose time is already
   over is left out — it was not answered, and pointing at the slot will not change
   that. */
export function pending(appointments: Appointment[], today: string, tomorrow: string, now: string) {
  return appointments
    .filter(appointment => undecided(appointment) && (appointment.date === today || appointment.date === tomorrow))
    .filter(appointment => appointment.date !== today || allDay(appointment) || appointment.end! > now)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""))[0];
}

/* The daypart rail is drawn, not photographed. The three sun marks follow the same
   dotted arc as the METACOM mittags/nachmittags symbols and differ only in where
   the sun stands on it, so the four marks read as one flat icon family and never
   compete with the appointment symbols. */
const sun = (cx: number, cy: number) => {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map(degree => {
    const angle = (degree * Math.PI) / 180, [dx, dy] = [Math.cos(angle), Math.sin(angle)];
    return `M${(cx + dx * 4.1).toFixed(1)} ${(cy + dy * 4.1).toFixed(1)}L${(cx + dx * 5.5).toFixed(1)} ${(cy + dy * 5.5).toFixed(1)}`;
  }).join("");
  return `<circle cx="${cx}" cy="${cy}" r="2.8" fill="currentColor" stroke="none"/><path d="${rays}" stroke-width="1.7"/>`;
};
const arc = `<path d="M4 20a8 8 0 0 1 16 0" stroke-dasharray="1.3 2.7" stroke-width="1.7" opacity=".8"/>`;
const glyph = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
/* The three sun marks and the moon, in the order of the times they belong to.
   Those times are the model's, because speech reads them too: a rail showing the
   evening moon while the button says Nachmittag is a disagreement that would only
   ever show up in front of the child. */
const daypartIcons = [
  glyph(arc + sun(5.8, 16.6)),
  glyph(arc + sun(12, 11.6)),
  glyph(arc + sun(18.2, 16.6)),
  glyph(`<path d="M20 15.4A8.4 8.4 0 0 1 8.6 4a7.4 7.4 0 1 0 11.4 11.4Z" fill="currentColor" stroke="none"/>`),
];
export const dayparts = daypartTimes.map((at, index) => ({ at, icon: daypartIcons[index]! }));

export const crown = `<svg class="crown" viewBox="0 0 24 15" aria-hidden="true"><path d="M1.5 13.5 3 2.5l5 4.5 4-6 4 6 5-4.5 1.5 11Z"/></svg>`;

/** Everything the board draws from, for one moment. */
export interface Built {
  at: Date;
  now: string;
  dates: string[];
  todayIndex: number;
  appointments: Appointment[];
  urls: Map<string, string>;
  people: Map<string, Person>;
  cards: Map<string, Card>;
  /* A birthday stays in the head as the face it always was; everything else
     all-day moved down into the band. The board asks this rather than working it
     out twice. */
  birthday: (appointment: Appointment) => boolean;
  /* One bar per stretch, laid over the week. The board says everything in
     pictures: a stretch carrying neither a picture nor a person has nothing to say
     here and is left to the calendar — the same rule the head's pills have always
     followed. */
  runs: Run[];
  /* What ARASAAC's licence asks for is a notice beside the pictures, so it is asked
     of what this week actually draws rather than of everything the household owns.
     METACOM comes out of a folder the household licensed itself and owes nothing,
     so a board that draws from a connected folder carries no line at all. */
  credit: string;
  /* The next open choice, or none. */
  open: Appointment | undefined;
  /* The grid's columns, with the rail's own track spliced in at today. */
  track: string[];
  active: number;
}

/* The board is a projection of one moment against one week, so building it is one
   function of `at`. Nothing is cached between builds except the drawn glyphs. */
export async function assemble(at: Date): Promise<Built> {
  const monday = mondayOf(at);
  const dates = Array.from({ length: 7 }, (_, index) => iso(addDays(monday, index)));
  const [appointments, peopleList, cardList, seriesList] = await Promise.all([week(monday), allPeople(), allCards(), allSeries()]);
  const cards = new Map(cardList.map(card => [card.id, card]));
  scale(appointments);
  const urls = await pictures([
    ...appointments.flatMap(appointment => appointment.symbols),
    ...cardList.map(card => card.symbol).filter(Boolean) as SymbolRef[],
  ]);
  const people = new Map(peopleList.map(person => [person.id, person]));
  const now = reading(at), todayIndex = (at.getDay() + 6) % 7;
  const birthday = (appointment: Appointment) => !!birthdayName(appointment, peopleList);
  const active = dayparts.filter(part => snapped(part.at) <= snapped(now)).length - 1;
  const track: string[] = dates.map((_, index) => (index === todayIndex ? "var(--today)" : "var(--col)"));
  track.splice(todayIndex, 0, "var(--rail)");
  const drawn: SymbolRef[] = [
    ...appointments.flatMap(appointment => appointment.symbols),
    ...appointments.flatMap(appointment => drawnSymbols(appointment, cards)),
    /* An open choice draws the cards it offers, small, under its question mark. */
    ...appointments.flatMap(appointment => appointment.options).map(id => cards.get(id)?.symbol).filter(Boolean) as SymbolRef[],
  ];
  /* Tomorrow is read out of the week on screen, so on a Sunday the bar has nothing
     to show for the Monday that follows: that Monday belongs to the next week and
     was never loaded. */
  const open = pending(appointments, iso(at), iso(addDays(at, 1)), now);
  const runs = runsOf(appointments, dates, new Map(seriesList.map(item => [item.id, item])))
    .filter(run => !birthday(run.appointment))
    .filter(run => drawnSymbols(run.appointment, cards).length || run.appointment.people.length);
  return { at, now, dates, todayIndex, appointments, urls, people, cards, birthday, runs, credit: owed(drawn).join(" "), open, track, active };
}
