import { addDays, allDay, board, bornOn, cardSays, dayFact, daypartTimes, iso, minute, notAtHome, reading, snapped, spokenName, undecided,
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
export type Utterance = { parts: Part[]; text: string; about?: string };
export type Household = { cards: Map<string, Card>; people: Map<string, Person> };

/* The fixed half of the vocabulary, in one object because that is what makes it
   listable: a recorder walks these, and `vocabulary()` is the whole of what has
   to exist before the first appointment is planned. A frame written inline
   somewhere else would be a clip nothing had asked anybody to record. */
const FRAMES = {
  /* *Es ist Dienstagabend*, not *Heute ist Dienstagabend*. The sentence says which
     moment it is, and a moment is not a day: *heute* names the whole of Tuesday
     and then hands back a quarter of it, which is a thing a person says about a
     date and not about where they are standing. The child is standing in front of
     today — it is the one word on this board that never has to be said. */
  day: "Es ist",
  and: ", und",
  birthday: "hat Geburtstag",
  birthdays: "haben Geburtstag",
  birthdayOf: "Heute ist der Geburtstag von",
  turns: "wird",
  turnsPlural: "werden",
  yearsOld: "Jahre alt.",
  visits: "kommt",
  visit: "kommen",
  and2: "und",
  comma: ",",
  /* Between two sentences of one utterance. A recorded pause, like the comma. */
  stop: ".",
  now: "Jetzt ist",
  nowFor: ", jetzt ist",
  ending: "ist gleich fertig",
  /* One word for the whole of it: *geplant*. What is empty on this board is
     empty because nobody planned anything there, and saying that plainly beats
     *du hast frei*, which frames a child's afternoon as time off from something.
     It is a word from the planning side of the app, and it is the same word in
     all four sentences so that it is learned once. */
  nothing: "Gerade ist nichts geplant.",
  soon: "Gleich kommt",
  after: "Danach kommt",
  then: "Dann kommt",
  again: "Danach kommt wieder",
  free: "Danach ist nichts geplant.",
  soonChoose: "Gleich darfst du aussuchen.",
  afterChoose: "Danach darfst du aussuchen.",
  thenChoose: "Dann darfst du aussuchen.",
  /* The same three, opened so the cards can follow. A choice ahead is worth
     waiting for because of what is in it, and *Danach darfst du aussuchen* on its
     own is an announcement about a slot: the child is told there will be a
     decision and not what it is between. Named here as it is named when the
     choice is open, and asked in the same words. */
  soonChooseFrom: "Gleich darfst du aussuchen:",
  afterChooseFrom: "Danach darfst du aussuchen:",
  thenChooseFrom: "Dann darfst du aussuchen:",
  /* Said at the slot, the moment a card answers the question — the one thing that
     happens at this board and used to happen silently, while the card that
     answers nothing has been spoken to all along. It names the card back, because
     which one was understood is the one thing the light over the slot cannot say.
     It says nothing about when: most answers are given to a question whose time
     has not come, tomorrow's included, and *Jetzt ist Schwimmbad* would be a
     promise about a moment that is not this one. */
  youChose: "Du hast",
  choseIt: "ausgesucht.",
  /* And the card that answers nothing. A card held at the reader is a question
     asked out loud, so it is answered in kind: what this one is not, and what
     would do instead. It was written out in the board's own file for as long as it
     existed, which put the one spoken sentence nobody could record outside the
     vocabulary a recorder is handed — silence, once clips replace the synthesiser,
     and nothing to notice it by. */
  thisCard: "Diese Karte",
  notOffered: "steht gerade nicht zur Auswahl.",
  youCan: "Du kannst",
  pick: "wählen.",
  done: "Heute ist nichts mehr geplant.",
  /* The one thing said about a day that is not today. Two fixed clips rather
     than a wording per absence: the household would have to record a second
     sentence for every one it ever plans, and "Heute fahren wir ins Saarland"
     cannot be turned into the sentence before it. See docs/speech.md. */
  away: "Bald fahren wir weg.",
  awayTomorrow: "Morgen fahren wir weg.",
  decided: ". Das hast du ausgesucht.",
  choose: "Jetzt darfst du aussuchen:",
  or: "oder",
  /* The question the naming leads to, and the same one whether the choice is open,
     still ahead, or standing open again because the card was taken back out — one
     clip, learned once, and it carries no full stop of its own so that it can also
     be said alone. It used to be *Leg eine Karte in den Schlitz*, which described a
     mechanism the board does not have: there is one place, and a card is stood in
     it. A sentence about the furniture would have to be rewritten with the
     furniture; a question about what the child wants survives it, and it is what
     is actually being asked. */
  asking: "Was möchtest du tun?",
  look: "Jetzt darfst du aussuchen. Schau, welche Karten daliegen. Was möchtest du tun?",
} as const;

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
/* They compound onto the weekday — Dienstagmorgen, Dienstagabend — so the day and
   the daypart cost one clip rather than two, and no seam falls inside a word. */
const DAYPARTS = ["morgen", "mittag", "nachmittag", "abend"];
const DAYS = WEEKDAYS.flatMap(day => DAYPARTS.map(part => `${day}${part}`));
/* The one number a child is told, and the only reason it is allowed: an age is
   what a birthday is *about*, and a three-year-old holds it the way they hold no
   clock time. Spelled rather than written, so the ban on digits stands as it is
   — and so the clip is a word like every other clip. Past this the sentence
   simply leaves the age out; nobody in the house is turning thirteen soon, and a
   wrong word would be worse than a missing one. */
/* What the right-hand column says for each of the four, in the words the rules
   are written in rather than in hours. */
const DAYPART_WHEN = ["morgens", "mittags", "nachmittags", "abends"];
const AGES = ["", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf"];
/** Every clip that is not a household word: what has to be recorded up front. */
export const vocabulary = (): string[] => [...DAYS, ...AGES.filter(Boolean), ...Object.values(FRAMES)];

/** Where *gleich* stops and *danach* begins. Minutes, and the child never hears it. */
const SOON = 20;
/* And where naming the next thing stops being worth doing at all. Told that
   dinner comes after Kita at nine in the morning, a two-year-old has been given
   a word and no time to hang it on; what is true and useful at nine is that
   nothing is being waited for. */
const HORIZON = 30;
/* How many days ahead an absence is worth mentioning. Seven, and the number never
   reaches the child: *bald* said a month out is the same word for something else
   entirely, so what carries the distance is that the sentence was not there
   yesterday and is there today. That is as close to a count of sleeps as a board
   gets that may not count. */
export const AHEAD = 7;

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

/* A full stop between two sentences of one utterance, and none where the clip
   before it already carries one — *Jahre alt.* is recorded with its own. */
const stopped = (parts: Part[]): Part[] => /[.!?]$/.test(parts.at(-1)?.say ?? ".") ? [] : [fixed(FRAMES.stop)];

/* Which appointment a sentence is about, where it is about one. The board lifts
   that card while the sentence plays, so the sound and the picture answer the
   same question at the same moment — which is most of what makes an announcement
   legible to somebody who cannot yet follow a sentence on its own. */
const about = (appointment: Appointment, line: Utterance): Utterance => ({ ...line, about: appointment.id });

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

/* The words of the cards on offer, or nothing where they cannot all be named.
   Naming three of four would describe a table wrongly, and beyond three it is a
   list nobody can hold — the same rule whether the choice is open now or ahead. */
function namedOptions(appointment: Appointment, household: Household): string[] | undefined {
  const said = appointment.options.map(id => cardSays(household.cards.get(id))).filter((word): word is string => !!word);
  return said.length && said.length === appointment.options.length && said.length <= 3 ? said : undefined;
}

/**
 * What the board says when the button is pressed: two or three short sentences,
 * always in the same order, chosen without any state of their own.
 */
export function announce(week: Appointment[], at: Date, household: Household, awayFrom?: string): Utterance[] {
  const now = reading(at), today = iso(at);
  /* Parallel appointments share the width of the day, and one of them has to be
     the one that is spoken. The innermost wins: the one that began last, and of
     two that began together the one that ends first.

     The earlier start used to win, which is nearly always the bracket rather than
     what is happening inside it — a therapy hour inside a Kita day was never
     announced at all, on any press, because the Kita had started first and would
     go on for hours. The specific thing is the one the child is in. */
  const here = timedOn(week, today).filter(item => item.start! <= now && now < item.end!);
  const running = here.length < 2 ? here[0]
    : [...here].sort((a, b) => snapped(b.start!) - snapped(a.start!) || snapped(a.end!) - snapped(b.end!))[0];

  /* The one thing that outranks the shape: while a choice is open there is
     something for the child to do, and a sentence about Tuesday in front of it is
     a sentence in the way. */
  if (running && undecided(running)) return [choosing(running, household)];

  /* Nothing running and nothing left: *Heute ist nichts mehr geplant* already says
     both of those, and *Gerade ist nichts geplant* in front of it is the same fact
     in a second wording. The one that stays is the one that carries more — it is
     about the whole of the rest of the day rather than about this minute, and a
     minute that is empty inside a day that is over is not news.

     The sibling case drops the other one: where something is still coming but
     hours off, the *now* sentence stays and *danach ist nichts geplant* goes. Both
     times the sentence that survives is the one with something in it. */
  const empty = !running && !timedOn(week, today).some(item => item.start! > now);
  /* Nothing is announced while we are already somewhere else. The day sentence is
     what says where we are, and *morgen fahren wir weg* on the first day of four
     at a grandmother's is about the second day of the stretch we are standing
     in — a sentence about nothing, and hardest to notice on that day of all days,
     because everything else in the announcement is right. */
  const elsewhere = week.some(item => item.date === today && notAtHome(item));
  return [dayLine(week, at, now, household),
    ...(empty ? [] : nowLine(running, now, week, today, household)),
    ...nextLine(week, at, now, running, household),
    ...awayLine(elsewhere ? undefined : awayFrom, today)];
}

/* The one sentence that reaches past today, and it is last on purpose.
 *
 * *Einmal schlafen, dann ist Kita* reached past it once and was taken out, for a
 * reason that does not hold here: it appeared only when the day had emptied out,
 * which is bedtime, when a board on a wall is behind somebody's back. This one
 * stands on every press of the whole day, and it is about the one thing a week
 * cannot show — that we will not be here.
 *
 * Derived from two dates and nothing else, so two presses a minute apart say the
 * same thing. On the day itself there is no sentence: the day is then the
 * subject, and `dayFact` has said it in the household's own words. */
function awayLine(awayFrom: string | undefined, today: string): Utterance[] {
  if (!awayFrom || awayFrom <= today) return [];
  const days = Math.round((Date.parse(`${awayFrom}T00:00`) - Date.parse(`${today}T00:00`)) / 86400000);
  if (days > AHEAD) return [];
  return [utter(fixed(days === 1 ? FRAMES.awayTomorrow : FRAMES.away))];
}

/* Es ist Dienstagmorgen — plus at most one clause, because an all-day
   appointment is the one thing the day carries that the other two sentences will
   never reach. A birthday and a visit are the shapes product.md names; anything
   else all-day is said by its own spoken word or not at all. */
function dayLine(week: Appointment[], at: Date, now: string, household: Household): Utterance {
  const facts = week.filter(item => item.date === iso(at) && allDay(item));
  const dayWord = `${WEEKDAYS[(at.getDay() + 6) % 7]}${DAYPARTS[daypartOf(now)]}`;
  /* A birthday follows the day rather than replacing it. It used to take the
     whole sentence, and then the one press that always begins *Es ist …* began
     somewhere else instead — on the day of the year a child presses the button
     most. The shape is what is learned here, so the day and the daypart come
     first on every press, and the birthday is the sentence after them. */
  const born = birthdayClause(facts, household);
  const guests = visitClause(facts, household);
  const named = namedFact(facts, household);
  /* A guest rides along on the day sentence — *und Oma kommt* adds a person to
     it, and the sentence still has the one subject it started with. A named fact
     does not: it arrives as a whole sentence of the household's own, with a
     subject of its own — see `dayFact` — so "Es ist Donnerstagmorgen, und heute
     ist Ferientag" hangs two sentences off one *und*. It becomes its own short
     sentence instead. The two then stand in the same shape, *Es ist …* and *Heute
     ist …*, and a parallel is easier for a two-year-old than an ellipsis. */
  const parts = [fixed(FRAMES.day), fixed(dayWord), ...(guests.length ? [fixed(FRAMES.and), ...guests] : [])];
  if (born.length) parts.push(...stopped(parts), ...born);
  if (named) parts.push(...stopped(parts), own(named));
  return utter(...parts);
}

/* Whose birthday it is, and how old they are turning — the age from the person's
   own date rather than from anything stored on the appointment, so it is right
   for a hundred years of them and cannot drift. */
function birthdayClause(facts: Appointment[], household: Household): Part[] {
  for (const fact of facts) {
    const born = peopleOn(fact, household).filter(person => bornOn(person, fact.date));
    if (!born.length) continue;
    const names = listing(born.map(person => person.name), fixed(FRAMES.and2));
    const years = new Set(born.map(person => Number(fact.date.slice(0, 4)) - Number(person.birthday!.slice(0, 4))));
    const age = years.size === 1 ? AGES[[...years][0]!] : undefined;
    return [fixed(FRAMES.birthdayOf), ...names,
      ...(age ? [fixed(FRAMES.stop), ...names, fixed(born.length > 1 ? FRAMES.turnsPlural : FRAMES.turns), fixed(age), fixed(FRAMES.yearsOld)] : [])];
  }
  return [];
}

/* A guest is a person with no symbol on them — the same record, which is why this
   asks what the appointment carries rather than what kind it is. */
function visitClause(facts: Appointment[], household: Household): Part[] {
  for (const fact of facts) {
    const guests = peopleOn(fact, household);
    if (guests.length && !fact.symbols.length && !guests.some(person => bornOn(person, fact.date)))
      return listing(guests.map(person => person.name), fixed(FRAMES.and2))
        .concat(fixed(guests.length > 1 ? FRAMES.visit : FRAMES.visits));
  }
  return [];
}
/** A day fact with something of its own to say: a holiday, a trip, a closed Kita. */
function namedFact(facts: Appointment[], _household: Household): string | undefined {
  for (const fact of facts) {
    const said = dayFact(fact);
    if (said) return said;
  }
  return undefined;
}

/* What the board draws as the lifted card. A nameless appointment says nothing
   rather than something empty: there is no honest sentence about an appointment
   whose word nobody has written, and inventing one from its file name is the
   thing docs/speech.md exists to forbid. */
function nowLine(running: Appointment | undefined, now: string, week: Appointment[], today: string, household: Household): Utterance[] {
  /* One sentence for an empty moment, whatever comes after it. There used to be
     two — the gap before something added *Du kannst spielen* — and the addition
     was the board telling a child what to do with their own time, which is not
     what it is for. It says what is true and stops; the next sentence says
     whether anything is coming. */
  if (!running) return [utter(fixed(FRAMES.nothing))];
  const said = spokenName(running, household.cards);
  if (!said) return [];
  /* Addressed by name where the appointment concerns exactly one person: that is
     the difference between an announcement and being meant. Two is a list, and a
     list is not an address. */
  const people = peopleOn(running, household);
  const who = people.length === 1 ? own(people[0]!.name) : undefined;
  if (minute(running.end!) - minute(now) <= board.snap)
    return [about(running, utter(...(who ? [who, fixed(FRAMES.comma)] : []), own(said), fixed(FRAMES.ending)))];
  const decided = running.chosen ? [fixed(FRAMES.decided)] : [];
  return [about(running, utter(...(who ? [who, fixed(FRAMES.nowFor)] : [fixed(FRAMES.now)]), own(said), ...decided))];
}

function nextLine(week: Appointment[], at: Date, now: string, running: Appointment | undefined, household: Household): Utterance[] {
  /* What is still running around the one being announced resumes the moment it
     ends, and that is what comes next — before anything that has not started.
     Without this the board said "Heute ist nichts mehr geplant" during a therapy
     hour with three more hours of Kita around it. */
  const around = running
    ? timedOn(week, iso(at)).filter(item => item !== running && item.start! <= now && item.end! > running.end!)
        .sort((a, b) => snapped(a.end!) - snapped(b.end!))[0]
    : undefined;
  if (around) {
    const said = spokenName(around, household.cards);
    return said ? [about(around, utter(fixed(FRAMES.again), own(said)))] : [];
  }
  const next = timedOn(week, iso(at)).find(item => item.start! > now);
  if (!next) return [restOfIt()];
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
  if (undecided(next)) {
    const offered = namedOptions(next, household);
    /* Named, so there is something to be asked about: the question follows the
       cards here as it does when the choice is open. Where they cannot all be
       named the sentence stops after saying a choice is coming — asking what the
       child wants, between nothing said, is a question with no answer in it. */
    return [about(next, offered
      ? utter(fixed(soon ? FRAMES.soonChooseFrom : running ? FRAMES.afterChooseFrom : FRAMES.thenChooseFrom),
          ...listing(offered, fixed(FRAMES.or)), fixed(FRAMES.stop), fixed(FRAMES.asking))
      : utter(fixed(soon ? FRAMES.soonChoose : running ? FRAMES.afterChoose : FRAMES.thenChoose)))];
  }
  const said = spokenName(next, household.cards);
  if (!said) return [];
  const when = soon ? FRAMES.soon : running ? FRAMES.after : FRAMES.then;
  return [about(next, utter(fixed(when), own(said), ...(next.chosen ? [fixed(FRAMES.decided)] : [])))];
}

/* What comes next stops at the day. *Einmal schlafen, dann ist Kita* reached past
   it once, and it reached for a moment nobody presses in: it needed the day
   emptied out and something on the next one, which is bedtime, when a board on a
   wall is behind somebody's back. What the board is for is the day in front of
   the child, and this sentence says so and stops.

   `awayLine` is the one thing said about a day that is not today, and it is a
   sentence of its own rather than a longer *next*: it is about where we will be
   and not about what happens after Kita. See docs/speech.md. */
function restOfIt(): Utterance {
  return utter(fixed(FRAMES.done));
}

/* An open choice, and it is the whole announcement. Where the cards cannot all be
   named the sentence points at the table the child is standing in front of. */
function choosing(running: Appointment, household: Household): Utterance {
  const said = namedOptions(running, household);
  return about(running, said
    ? utter(fixed(FRAMES.choose), ...listing(said, fixed(FRAMES.or)), fixed(FRAMES.stop), fixed(FRAMES.asking))
    : utter(fixed(FRAMES.look)));
}

/** What is said at the slot when a card answers the question it was asked. */
export const answered = (word: string): Utterance => utter(fixed(FRAMES.youChose), own(word), fixed(FRAMES.choseIt));

/** And when the card is taken back out: the question is standing there again. */
export const asking = (): Utterance => utter(fixed(FRAMES.asking));

/* What is said to a card that answers nothing: what it is not, and what would do
   instead. The word is the card's where the tag belongs to one, and *Diese Karte*
   where the board has never seen the tag before — which is a card all the same, to
   the child holding it. */
export const refused = (word: string | undefined, offered: string[]): Utterance =>
  utter(word ? own(word) : fixed(FRAMES.thisCard), fixed(FRAMES.notOffered),
    fixed(FRAMES.youCan), ...listing(offered, fixed(FRAMES.or)), fixed(FRAMES.pick));

/* Every sentence a record can turn up in, for whoever is writing its word.

   Derived from the same frames the board speaks from rather than listed by hand,
   so a rule that changes here changes what the calendar promises in the same
   commit. It is also an honest preview of what a household would have to record:
   the fixed half of each line is a clip that exists once for everything, and only
   the word in it is theirs. See docs/speech.md. */
export type Possible = { text: string; when: string };
export type Shape = {
  /** The one person it concerns, where it concerns exactly one. */
  who?: string;
/* The words of the cards on offer, while nothing has picked one of them. Its
     *presence* is what says this is a choice — an empty list is a choice whose
     cards have not been added yet, which still says nothing of its own. */
  offering?: string[];
  /** Whether it can also turn up as an appointment that something picked. */
  picked?: boolean;
  /** All day rather than at a time: a different set of sentences entirely. */
  allDay?: boolean;
  /** And a day the household is not at home: two more, said on the days before. */
  away?: boolean;
  /** A card rather than an appointment: it can be the answer laid at the slot. */
  card?: boolean;
  /** Whose birthday it is, and how old they turn. Said from the person, after
      the day sentence — so it wants `date` like every other day sentence. */
  birthday?: { names: string[]; age?: number };
  /** All-day, carrying people and no symbol: a guest. Also said from the person. */
  visiting?: string[];
  /** The day it falls on. A day sentence names its weekday, and there are seven. */
  date?: string;
};

/* Whether the sentences come from somewhere other than this record's own word,
   so that the Ansage field can say so rather than take one it will not use. A
   birthday and a visit are said from the person — the day sentence asks about
   people before it asks about a name — and an open choice is said from the cards
   it offers, which is the whole of what it has to say until one is picked. */
export const fromPeople = (shape: Shape) => !!(shape.birthday?.names.length || shape.visiting?.length) || shape.offering !== undefined;

export function couldSay(word: string, shape: Shape = {}): Possible[] {
  const said = word.trim();
  const line = (...parts: Part[]) => utter(...parts).text;
  const names = (who: string[]) => listing(who, fixed(FRAMES.and2));
  /* A day sentence names the day it is said on, and it compounds the daypart onto
     it — so an all-day fact has four of them and not one. Listing a single
     specimen meant printing a Tuesday under a Thursday appointment, which is two
     wrong words in the one sentence a person was reading to check the words. */
  const days = shape.date
    ? DAYPARTS.map((part, index) => ({ word: `${WEEKDAYS[(new Date(`${shape.date}T00:00`).getDay() + 6) % 7]}${part}`, when: DAYPART_WHEN[index]! }))
    : [];

  /* Said from the people, whatever the word is — so these come first and the
     word never reaches them. */
  if (shape.birthday?.names.length) {
    const age = shape.birthday.age === undefined ? undefined : AGES[shape.birthday.age];
    const who = names(shape.birthday.names);
    const clause = [fixed(FRAMES.birthdayOf), ...who,
      ...(age ? [fixed(FRAMES.stop), ...who, fixed(shape.birthday.names.length > 1 ? FRAMES.turnsPlural : FRAMES.turns), fixed(age), fixed(FRAMES.yearsOld)] : [])];
    return days.map(day => ({
      text: line(fixed(FRAMES.day), fixed(day.word), fixed(FRAMES.stop), ...clause),
      when: day.when,
    }));
  }
  if (shape.visiting?.length) return days.map(day => ({
    text: line(fixed(FRAMES.day), fixed(day.word), fixed(FRAMES.and), ...names(shape.visiting!),
      fixed(shape.visiting!.length > 1 ? FRAMES.visit : FRAMES.visits)),
    when: day.when,
  }));

  /* A choice that nothing has picked says only that there is something to pick,
     and names the cards rather than itself. Until then it is not an appointment
     the child has: nobody can be told that Nachmittagszeit is now, because
     Nachmittagszeit is the word the parents filed it under and not a thing that
     happens. Once something picked, the sentences below are about what was
     picked, in its word. */
  if (shape.offering) {
    const offered = shape.offering.filter(word => word.trim());
    /* Named only where there is something to name and every one of them has a
       word: none yet, or one missing, and the sentence points at the table
       instead of reading out a list with a hole in it. */
    const named = offered.length > 0 && offered.length === shape.offering.length && offered.length <= 3;
    /* Ahead of it the cards are named too, in the same three frames. */
    const ahead = (opening: string, bare: string) =>
      named ? line(fixed(opening), ...listing(offered, fixed(FRAMES.or)), fixed(FRAMES.stop), fixed(FRAMES.asking)) : bare;
    return [
      { text: named ? line(fixed(FRAMES.choose), ...listing(offered, fixed(FRAMES.or)), fixed(FRAMES.stop), fixed(FRAMES.asking)) : FRAMES.look,
        when: "wenn die Wahl offen ist" },
      { text: ahead(FRAMES.afterChooseFrom, FRAMES.afterChoose), when: "davor, wenn etwas läuft" },
      { text: ahead(FRAMES.soonChooseFrom, FRAMES.soonChoose), when: "bis 20 Minuten davor" },
      { text: ahead(FRAMES.thenChooseFrom, FRAMES.thenChoose), when: "in einer Lücke davor" },
    ];
  }

  /* Said on the days before rather than on the day, so they belong to no daypart
     and are not built from the word — which is also why an absence with nothing
     written in its Ansage still lists them: the board will say them either way. */
  const ahead: Possible[] = shape.allDay && shape.away
    ? [{ text: FRAMES.away, when: `bis ${AHEAD} Tage vorher` }, { text: FRAMES.awayTomorrow, when: "am Tag davor" }]
    : [];

  if (!said) return ahead;
  const w = own(said), who = shape.who ? own(shape.who) : undefined;
  const tail = shape.picked ? [fixed(FRAMES.decided)] : [];

  /* An all-day appointment is never running and never next: it is a fact about
     the day, and the day sentence is the only one that carries it. */
  /* An all-day fact says a sentence rather than a word — see `dayFact`. It is
     handed one, so nothing here wraps it. */
  if (shape.allDay) return [...days.map(day => ({
    text: line(fixed(FRAMES.day), fixed(day.word), fixed(FRAMES.stop), w),
    when: day.when,
  })), ...ahead];

  const possible: Possible[] = [];
  possible.push(
    { text: who ? line(who, fixed(FRAMES.nowFor), w, ...tail) : line(fixed(FRAMES.now), w, ...tail), when: "während er läuft" },
    { text: who ? line(who, fixed(FRAMES.comma), w, fixed(FRAMES.ending)) : line(w, fixed(FRAMES.ending)), when: "in der letzten Viertelstunde" },
    { text: line(fixed(FRAMES.soon), w, ...tail), when: "bis 20 Minuten vorher" },
    { text: line(fixed(FRAMES.after), w, ...tail), when: "wenn etwas anderes läuft" },
    { text: line(fixed(FRAMES.then), w, ...tail), when: "in einer Lücke davor" },
  );
  /* Only a card can be the answer to a question: an appointment's own word is
     never laid at the slot, so it is never said back. */
  if (shape.card) possible.push({ text: answered(said).text, when: "wenn die Karte gewählt wird" });
  return possible;
}


/* Every sentence that belongs to no record: the day in its twenty-eight forms,
   and the ones that are about nothing happening. They cannot be prepared when
   something is planned, because nothing plans them — so they are prepared when a
   voice is chosen, which is the other moment a household waits on purpose. */
export function standing(): string[] {
  const line = (...parts: Part[]) => utter(...parts).text;
  return [
    ...DAYS.map(day => line(fixed(FRAMES.day), fixed(day))),
    FRAMES.nothing, FRAMES.done, FRAMES.free, FRAMES.look,
    FRAMES.away, FRAMES.awayTomorrow,
    FRAMES.soonChoose, FRAMES.afterChoose, FRAMES.thenChoose,
  ];
}
