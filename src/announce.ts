import { addDays, allDay, board, bornOn, cardSays, daypartTimes, iso, minute, reading, snapped, spokenName, undecided,
  type Appointment, type Card, type Person } from "./model.js";

/* The week, one moment, and what is said out loud about it. See docs/speech.md
   for the catalogue and for why none of it carries a clock time or a date.

   This file derives text and nothing else: no audio, no DOM, no clock of its own.
   The moment is handed in, the way the board hands one to `build`, so the same
   week can be asked what it would say at any minute — which is what makes it
   testable and what lets a day be prepared ahead of time.

   Every sentence comes apart into the clips it is played from: fixed words that
   are recorded once, and the household's own words, recorded with the record
   they belong to. Nothing here knows what a clip sounds like. */

/** One clip. `own` marks a word that came out of a household record. */
export type Part = { say: string; own: boolean };
/** One utterance: the clips it is played from, and how the whole of it reads. */
export type Utterance = { parts: Part[]; text: string };
export type Household = { cards: Map<string, Card>; people: Map<string, Person> };

/* The fixed half of the vocabulary, in one object because that is what makes it
   listable: a recorder walks these, and `vocabulary()` is the whole of what has
   to exist before the first appointment is planned. A frame written inline
   somewhere else would be a clip nothing had asked anybody to record. */
const FRAMES = {
  today: "Heute ist",
  and: ", und",
  alsoToday: "heute ist",
  birthday: "hat Geburtstag",
  birthdays: "haben Geburtstag",
  visits: "kommt",
  visit: "kommen",
  and2: "und",
  comma: ",",
  now: "Jetzt ist",
  nowFor: ", jetzt ist",
  ending: "ist gleich fertig",
  nothing: "Gerade ist nichts.",
  nothingYet: "Gerade ist nichts. Du kannst spielen.",
  soon: "Gleich kommt",
  after: "Danach kommt",
  then: "Dann kommt",
  free: "Danach hast du frei.",
  soonChoose: "Gleich darfst du aussuchen.",
  afterChoose: "Danach darfst du aussuchen.",
  thenChoose: "Dann darfst du aussuchen.",
  done: "Heute kommt nichts mehr.",
  sleep: "Einmal schlafen, dann ist",
  decided: ". Das hast du ausgesucht.",
  choose: "Jetzt darfst du aussuchen:",
  or: "oder",
  slot: ". Leg eine Karte in den Schlitz.",
  look: "Jetzt darfst du aussuchen. Schau, welche Karten daliegen, und leg eine in den Schlitz.",
} as const;

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
/* They compound onto the weekday — Dienstagmorgen, Dienstagabend — so the day and
   the daypart cost one clip rather than two, and no seam falls inside a word. */
const DAYPARTS = ["morgen", "mittag", "nachmittag", "abend"];
const DAYS = WEEKDAYS.flatMap(day => DAYPARTS.map(part => `${day}${part}`));
/** Every clip that is not a household word: what has to be recorded up front. */
export const vocabulary = (): string[] => [...DAYS, ...Object.values(FRAMES)];

/** Where *gleich* stops and *danach* begins. Minutes, and the child never hears it. */
const SOON = 20;
/* And where naming the next thing stops being worth doing at all. Told that
   dinner comes after Kita at nine in the morning, a two-year-old has been given
   a word and no time to hang it on; what is true and useful at nine is that
   nothing is being waited for. */
const HORIZON = 30;

const fixed = (say: string): Part => ({ say, own: false });
const own = (say: string): Part => ({ say, own: true });
/* Clips are spoken one after another; the text is how the same thing reads. A
   part opening with punctuation closes up against what came before, and a
   sentence that ends on a household word is given its full stop here, since a
   word is recorded once and cannot carry one. */
const utter = (...parts: Part[]): Utterance => {
  const text = parts.reduce((line, part) => line && !/^[,.:;!?]/.test(part.say) ? `${line} ${part.say}` : line + part.say, "");
  return { parts, text: /[.!?]$/.test(text) ? text : `${text}.` };
};

const byStart = (a: Appointment, b: Appointment) => snapped(a.start!) - snapped(b.start!) || snapped(a.end!) - snapped(b.end!);
const timedOn = (week: Appointment[], date: string) => week.filter(item => item.date === date && !allDay(item)).sort(byStart);
/* Before the first mark it is still morning: the rail leaves all four marks small
   until eight, but there is no fifth word for a child to hear at half past six. */
const daypartOf = (now: string) => Math.max(0, daypartTimes.filter(at => snapped(at) <= snapped(now)).length - 1);

/* A list with a clip for each of its joints. The comma is a recorded pause, which
   is what it already is when somebody reads a list out loud. */
const joined = (parts: Part[], last: Part): Part[] =>
  parts.flatMap((part, index) => index === parts.length - 1 ? [part, last] : [part, fixed(FRAMES.comma)]);
const listing = (words: string[], last: Part): Part[] =>
  words.length < 2 ? words.map(own) : joined(words.slice(0, -1).map(own), last).concat(own(words.at(-1)!));
const peopleOn = (appointment: Appointment, household: Household) =>
  appointment.people.map(id => household.people.get(id)).filter((person): person is Person => !!person);

/**
 * What the board says when the button is pressed: two or three short sentences,
 * always in the same order, chosen without any state of their own.
 */
export function announce(week: Appointment[], at: Date, household: Household): Utterance[] {
  const now = reading(at), today = iso(at);
  /* Parallel appointments share the width of the day, and one of them has to be
     the one that is spoken. The earlier start wins, which is the order the board
     already lays them out in. */
  const running = timedOn(week, today).find(item => item.start! <= now && now < item.end!);

  /* The one thing that outranks the shape: while a choice is open there is
     something for the child to do, and a sentence about Tuesday in front of it is
     a sentence in the way. */
  if (running && undecided(running)) return [choosing(running, household)];

  return [dayLine(week, at, now, household), ...nowLine(running, now, week, today, household), ...nextLine(week, at, now, running, household)];
}

/* Heute ist Dienstagmorgen — plus at most one clause, because an all-day
   appointment is the one thing the day carries that the other two sentences will
   never reach. A birthday and a visit are the shapes product.md names; anything
   else all-day is said by its own spoken word or not at all. */
function dayLine(week: Appointment[], at: Date, now: string, household: Household): Utterance {
  const day = `${WEEKDAYS[(at.getDay() + 6) % 7]}${DAYPARTS[daypartOf(now)]}`;
  const clause = dayClause(week.filter(item => item.date === iso(at) && allDay(item)), household);
  return utter(fixed(FRAMES.today), fixed(day), ...(clause.length ? [fixed(FRAMES.and), ...clause] : []));
}

function dayClause(facts: Appointment[], household: Household): Part[] {
  for (const fact of facts) {
    const born = peopleOn(fact, household).filter(person => bornOn(person, fact.date));
    if (born.length) return listing(born.map(person => person.name), fixed(FRAMES.and2))
      .concat(fixed(born.length > 1 ? FRAMES.birthdays : FRAMES.birthday));
  }
  /* A guest is a person with no symbol on them — the same record, which is why
     this asks what the appointment carries rather than what kind it is. */
  for (const fact of facts) {
    const guests = peopleOn(fact, household);
    if (guests.length && !fact.symbols.length) return listing(guests.map(person => person.name), fixed(FRAMES.and2))
      .concat(fixed(guests.length > 1 ? FRAMES.visit : FRAMES.visits));
  }
  for (const fact of facts) {
    const said = spokenName(fact, household.cards);
    if (said) return [fixed(FRAMES.alsoToday), own(said)];
  }
  return [];
}

/* What the board draws as the lifted card. A nameless appointment says nothing
   rather than something empty: there is no honest sentence about an appointment
   whose word nobody has written, and inventing one from its file name is the
   thing docs/speech.md exists to forbid. */
function nowLine(running: Appointment | undefined, now: string, week: Appointment[], today: string, household: Household): Utterance[] {
  if (!running) {
    /* Only where the day still has something in it. In the evening the gap is not
       a gap, and *du kannst spielen* would be the wrong thing to tell a child at
       eight — the next sentence says the day is over instead. */
    const more = timedOn(week, today).some(item => item.start! > now);
    return [utter(fixed(more ? FRAMES.nothingYet : FRAMES.nothing))];
  }
  const said = spokenName(running, household.cards);
  if (!said) return [];
  /* Addressed by name where the appointment concerns exactly one person: that is
     the difference between an announcement and being meant. Two is a list, and a
     list is not an address. */
  const people = peopleOn(running, household);
  const who = people.length === 1 ? own(people[0]!.name) : undefined;
  if (minute(running.end!) - minute(now) <= board.snap)
    return [utter(...(who ? [who, fixed(FRAMES.comma)] : []), own(said), fixed(FRAMES.ending))];
  const decided = running.chosen ? [fixed(FRAMES.decided)] : [];
  return [utter(...(who ? [who, fixed(FRAMES.nowFor)] : [fixed(FRAMES.now)]), own(said), ...decided)];
}

function nextLine(week: Appointment[], at: Date, now: string, running: Appointment | undefined, household: Household): Utterance[] {
  const next = timedOn(week, iso(at)).find(item => item.start! > now);
  if (!next) return [restOfIt(week, at, household)];
  /* *Danach* presumes something to be after. Where nothing is running there is
     nothing for it to follow, so the same appointment is *dann*. */
  const soon = minute(next.start!) - minute(now) <= SOON;
  /* *Gleich* is wall time and the wait is not. What a child is waiting through is
     the gap after whatever is happening now, so it is measured from the end of a
     running appointment and from this minute when nothing is running — which is
     what makes "Danach kommt Turnen" right at nine for a Turnen that follows Kita
     at two, and wrong for a supper five hours behind it. */
  const wait = minute(next.start!) - (running ? minute(running.end!) : minute(now));
  if (!soon && wait > HORIZON) {
    /* Nothing running and nothing near: the *now* sentence has already said there
       is time to play, and saying it twice in two wordings is worse than once. */
    return running ? [utter(fixed(FRAMES.free))] : [];
  }
  if (undecided(next)) return [utter(fixed(soon ? FRAMES.soonChoose : running ? FRAMES.afterChoose : FRAMES.thenChoose))];
  const said = spokenName(next, household.cards);
  if (!said) return [];
  const when = soon ? FRAMES.soon : running ? FRAMES.after : FRAMES.then;
  return [utter(fixed(when), own(said), ...(next.chosen ? [fixed(FRAMES.decided)] : []))];
}

/* Sleeps are the one unit a two-year-old already owns, and exactly one of them is
   as far as it reaches. Beyond Sunday there is nothing to look into — the board
   holds one week — so the sentence simply ends there. */
function restOfIt(week: Appointment[], at: Date, household: Household): Utterance {
  const tomorrow = timedOn(week, iso(addDays(at, 1)))[0];
  const said = tomorrow ? spokenName(tomorrow, household.cards) : undefined;
  return said ? utter(fixed(FRAMES.done), fixed(FRAMES.sleep), own(said)) : utter(fixed(FRAMES.done));
}

/* An open choice, and it is the whole announcement. The options are named only
   where every one of them has a word of its own: naming three of four would
   describe a table the child is looking at, wrongly. */
function choosing(running: Appointment, household: Household): Utterance {
  const said = running.options.map(id => cardSays(household.cards.get(id))).filter((word): word is string => !!word);
  return said.length === running.options.length && said.length <= 3
    ? utter(fixed(FRAMES.choose), ...listing(said, fixed(FRAMES.or)), fixed(FRAMES.slot))
    : utter(fixed(FRAMES.look));
}
