/* What both routes agree on: the calendar writes these records, the board reads
   them. Nothing here knows where they are stored. */

/** Household configuration: the visible window of a day and the planning grid. */
export const board = { from: "07:00", to: "20:30", snap: 15 };

/* A symbol is named, never embedded. For METACOM the name is the path relative to
   the household's own licensed folder, which is what `bildquelle` indexes by; for
   ARASAAC it is the pictogram number. The files of a licensed collection, an index
   of one and a count of it never travel — a reference does. See ADR 002. */
export type Source = "metacom" | "arasaac";
export type SymbolRef = { source: Source; id: string; label: string };

/* An ordinary appointment carries its symbols directly. It needs nothing else: it
   is written once — as a series, usually — and a picture is all the board asks of
   it.

   A choice appointment is the exception, and the reason is physical. What may be
   picked is a set of laminated cards that exist in the household, each with a
   symbol, something to say when it is offered, and an NFC tag to be recognised by.
   That is an object, so it is a record: a `Card`. Cards are made once and used by
   every choice appointment that offers them. */
export type Card = { id: string; name: string; symbol?: SymbolRef; speech?: string; nfc?: string; tone?: string; updatedAt: number };

/* Ten tones that stay apart from each other on a light and a dark ground. Colour is
   what makes a week readable: without it seven columns of the same routine are one
   grey block, and the forty-five minutes that must not be missed look exactly like
   the five hours that repeat. */
export const TONES = ["#4f8fd6", "#59a36c", "#d1913c", "#c4604f", "#8a6bc4", "#3fa3a0", "#c2679b", "#7d8f4a", "#a8703c", "#6f7683"];
export const toneOf = (card: Card | undefined, fallback = "") => card?.tone ?? hashTone(fallback);
/* A colour without a record behind it: the same symbol is always the same colour,
   so the week reads as a pattern and nothing has to be stored or chosen. */
export function hashTone(seed: string): string {
  let sum = 0;
  for (let index = 0; index < seed.length; index++) sum = (sum * 31 + seed.charCodeAt(index)) >>> 0;
  return TONES[sum % TONES.length];
}

/* One appointment, one record, one UUID, one day: a conflict then needs two people
   editing the same appointment rather than the same evening. See ADR 002.

   An appointment is always concrete — a date, and a time span unless it lasts all
   day. No rule is ever stored, so the board reads what was planned and never has
   to work anything out. That also means a change to what happens from October
   cannot rewrite what September's board showed. */
export type Appointment = {
  id: string;
  date: string;
  /** Absent on both means all day. */
  start?: string;
  end?: string;
  /** A name of its own. Without one the appointment is called after what happens. */
  title?: string;
  /* The board never draws a title — it draws symbols — so a title is written for
     whoever is planning, and may carry what the child is not told: a room, a
     practice, a surname. `speech` is the word said instead where those come
     apart, and it is empty everywhere else. */
  speech?: string;
  /** What happens: the symbols this appointment shows. */
  symbols: SymbolRef[];
  /** Or what may happen: the cards offered, and which one an input picked. */
  options: string[];
  chosen?: string;
  people: string[];
  showPeople: boolean;
  /** Which batch this was created in, if any. A label, never a rule. */
  series?: string;
  updatedAt: number;
};
export const allDay = (appointment: Appointment) => !appointment.start;

/* A series records how a batch of appointments was made — the pattern and how far
   it ran — so they can be listed, extended and cleared away together. It is not
   authoritative: losing it loses those three conveniences and nothing else, and the
   board never sees it. A visit over a weekend is the same mechanism as a weekly
   Kita, only shorter. */
export type Pattern =
  | { kind: "daily" }
  | { kind: "weekly"; weekdays: number[] }
  | { kind: "yearly" };
export type Series = { id: string; pattern: Pattern; from: string; until: string; allDay: boolean; createdAt: number };

/* A birthday is not a kind of appointment. It is a date on a person, and the
   appointments it produces are ordinary all-day ones carrying that person. The
   crown is then derived rather than stored: any day that is somebody's birthday
   wears one, and nothing in the appointment has to say so. */
export type Person = { id: string; name: string; initials: string; tone: string; photo?: string; birthday?: string; birthdaySeries?: string };
export const bornOn = (person: Person, date: string) => !!person.birthday && person.birthday.slice(5) === date.slice(5);

/* Appointments that run at the same time share the width of their day. Both routes
   lay them out the same way, so the board and the calendar never disagree about
   what is parallel to what. */
export type Laid = { appointment: Appointment; lane: number; lanes: number };
export function lanesOf(appointments: Appointment[]): Laid[] {
  const laid: Laid[] = [...appointments]
    .sort((a, b) => snapped(a.start ?? "00:00") - snapped(b.start ?? "00:00") || snapped(b.end ?? "00:00") - snapped(a.end ?? "00:00"))
    .map(appointment => ({ appointment, lane: 0, lanes: 1 }));
  let cluster: Laid[] = [], ends: number[] = [], clusterEnd = -Infinity;
  const close = () => {
    const lanes = cluster.reduce((most, item) => Math.max(most, item.lane + 1), 1);
    cluster.forEach(item => { item.lanes = lanes; });
    cluster = []; ends = []; clusterEnd = -Infinity;
  };
  laid.forEach(item => {
    const start = snapped(item.appointment.start ?? "00:00"), end = snapped(item.appointment.end ?? "00:00");
    if (start >= clusterEnd) close();
    const free = ends.findIndex(taken => taken <= start);
    item.lane = free === -1 ? ends.length : free;
    ends[item.lane] = end;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, end);
  });
  close();
  return laid;
}

/** Which dates a pattern covers between its bounds. Monday is 0. */
export function occurrences(pattern: Pattern, from: string, until: string): string[] {
  const start = new Date(`${from}T00:00`), stop = new Date(`${until}T00:00`);
  const dates: string[] = [];
  /* A yearly pattern steps by years. Walking it a day at a time would need thirty
     thousand iterations for a century and hit the guard below long before. */
  if (pattern.kind === "yearly") {
    for (let year = start.getFullYear(); year <= stop.getFullYear(); year++) {
      const at = new Date(year, start.getMonth(), start.getDate());
      if (at >= start && at <= stop) dates.push(iso(at));
    }
    return dates;
  }
  for (let at = start; at <= stop && dates.length < 4000; at = addDays(at, 1)) {
    const weekday = (at.getDay() + 6) % 7;
    if (pattern.kind === "daily" || pattern.weekdays.includes(weekday)) dates.push(iso(at));
  }
  return dates;
}

export const undecided = (appointment: Appointment) => appointment.options.length > 0 && !appointment.chosen;
/** Which cards an appointment offers: the one that was picked, or all of them. */
export const shownCards = (appointment: Appointment): string[] => {
  if (!appointment.options.length) return [];
  return appointment.chosen && appointment.options.includes(appointment.chosen) ? [appointment.chosen] : appointment.options;
};
/* What an appointment is called: its own name where it has one, otherwise what
   happens in it. Naming every Kita morning by hand would be work for nothing, and a
   parents' evening is not called after its symbol — so both, in that order. */
export const derivedName = (appointment: Appointment, byId: Map<string, Card>) =>
  (appointment.options.length
    ? shownCards(appointment).map(id => byId.get(id)?.name)
    : appointment.symbols.map(symbol => symbol.label)).filter(Boolean).join(" · ");
export const titleOf = (appointment: Appointment, byId: Map<string, Card>) =>
  appointment.title?.trim() || derivedName(appointment, byId);
/* What an appointment is *called out loud*, which is not what it is captioned.
   `derivedName` falls back to symbol labels, and a symbol label is a file name:
   the breakfast picture is `fruehstueck2.png` and the Kita one is
   `kindergaertnerin.png`. Written under a picture that is a serviceable caption;
   said to a two-year-old it is wrong or meaningless, so speech never falls back
   there. What is left is what a person wrote — the appointment's own spoken form,
   its name, or the card a choice resolved to — and where there is none the
   sentence that wanted it is not said at all. */
/* Every record says a **word**, never a sentence. The sentences are frames in
   `announce.ts` with one slot in them, so a card offered and the same card named
   an hour later are the same noun in two different frames — and nobody has ever
   had to type either frame. That is also what keeps a word usable in a sentence
   nobody has written yet: a phrase would be right in the frame it was written
   for and wrong in the next one. */
export const cardSays = (card: Card | undefined): string | undefined =>
  card?.speech?.trim() || card?.name.trim() || undefined;
export const spokenName = (appointment: Appointment, byId: Map<string, Card>): string | undefined =>
  appointment.speech?.trim() || appointment.title?.trim() || cardSays(byId.get(appointment.chosen ?? ""));
/** The colour an appointment wears: its card's, or one derived from its symbol. */
export const appointmentTone = (appointment: Appointment, byId: Map<string, Card>) =>
  appointment.options.length
    ? toneOf(byId.get(shownCards(appointment)[0]!), appointment.options[0] ?? "")
    : hashTone(appointment.symbols[0] ? `${appointment.symbols[0].source}:${appointment.symbols[0].id}` : appointment.title ?? "");

/* When each of the rail's four marks takes over. The board draws them and speech
   names them, so they are here rather than in either — a rail showing the evening
   moon while the button says Nachmittag is the kind of disagreement that only
   shows up in front of the child. */
export const daypartTimes = ["08:00", "12:00", "15:30", "19:15"];

export const minute = (time: string) => { const [hour, rest] = time.split(":").map(Number); return hour * 60 + rest; };
export const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const snapped = (time: string) => Math.round(minute(time) / board.snap) * board.snap;
export const reading = (at: Date) => `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;

/** Dates are ISO so they sort, and an index over them makes a week a range query. */
export const iso = (at: Date) => `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
export const mondayOf = (at: Date) => { const start = new Date(at); start.setDate(at.getDate() - ((at.getDay() + 6) % 7)); return start; };
export const addDays = (at: Date, days: number) => { const next = new Date(at); next.setDate(at.getDate() + days); return next; };
export const weekdays = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];
export const dayLabel = (date: string) => { const [, month, day] = date.split("-"); return `${Number(day)}.${Number(month)}.`; };
/* The same date with its year on it. A day inside the week on screen does not need
   one — the week says which year it is — but where a batch stops can be years away,
   and a bare 25.10. there reads as this year, which is a different date. */
export const dateLabel = (date: string) => `${dayLabel(date)}${date.slice(0, 4)}`;

/* What the household set up once, as opposed to what it planned. One record and
   never localStorage: a preference living in two stores is one that gets restored
   by one of them and overwritten by the other, and localStorage survives the
   database being cleared. conventions.md §1.2 and §1.3.

   The voice is one for the whole calendar, deliberately — not per appointment, per
   card, per series or per person. mitreden keeps a voice per Sammlung because a
   recording is a fact about the file it produced; a household has one board in one
   hallway, and a week that changes voice between Tuesday and Wednesday is a week
   that sounds broken. It is a stimmquelle voice id, which is exactly what speech
   will later be asked for, so nothing has to be translated. */
export type Settings = {
  /** Passed to Azure from the tab and never anywhere else. It is what makes the
      Azure voices appear in a picker at all. */
  azure?: { key: string; region: string };
  voice?: string;
  /** Which of METACOM's parallel renderings the search should offer first — a
      folder segment, absent for no preference. Ordering only: nothing is filtered
      out, so a symbol that exists in one fassung stays reachable and what is
      already in the calendar keeps the picture it has. */
  metacomRendering?: string;
};
