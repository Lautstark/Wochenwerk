import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { addDays, iso, mondayOf, occurrences, TONES, type Card, type Appointment, type Pattern, type Person, type Series, type SymbolRef } from "./model.js";

/* IndexedDB through `idb`, a store per kind with real indexes — the family's
   convention, and the shape a folder of one file per record maps onto when the
   store moves there. See ADR 002. */
interface Wochenwerk extends DBSchema {
  appointments: { key: string; value: Appointment; indexes: { date: string; series: string } };
  series: { key: string; value: Series };
  people: { key: string; value: Person };
  cards: { key: string; value: Card };
}

/* Version 2 dropped the separate visit/birthday record. Both are ordinary all-day
   appointments now: the person hangs off the appointment like on any other, and a
   birthday's crown became the symbol it always should have been. */
type OldSpecial = { id: string; kind: "visit" | "birthday"; person: string; from: string; to: string };
const cake: SymbolRef = { source: "metacom", id: "Feste/geburtstag.png", label: "Geburtstag" };

let opening: Promise<IDBPDatabase<Wochenwerk>> | null = null;
const db = () => (opening ??= openDB<Wochenwerk>("wochenwerk", 4, {
  async upgrade(database, from, _to, transaction) {
    if (from < 1) {
      const appointments = database.createObjectStore("appointments", { keyPath: "id" });
      appointments.createIndex("date", "date");
      appointments.createIndex("series", "series");
      database.createObjectStore("people", { keyPath: "id" });
    }
    if (from < 2) {
      database.createObjectStore("series", { keyPath: "id" });
      if (from === 1) {
        (transaction.objectStore("appointments") as unknown as { createIndex(name: string, path: string): void }).createIndex("series", "series");
        const old = transaction.objectStore("specials" as never) as unknown as { getAll(): Promise<OldSpecial[]> } | undefined;
        const specials = old ? await old.getAll() : [];
        for (const special of specials) {
          const id = crypto.randomUUID();
          transaction.objectStore("series").put({ id, pattern: { kind: "daily" }, from: special.from, until: special.to, allDay: true, createdAt: Date.now() });
          for (const date of occurrences({ kind: "daily" }, special.from, special.to)) {
            transaction.objectStore("appointments").put({
              id: crypto.randomUUID(), date, symbols: special.kind === "birthday" ? [cake] : [],
              options: [], people: [special.person], showPeople: true, series: id, updatedAt: Date.now(),
            } as unknown as Appointment);
          }
        }
        database.deleteObjectStore("specials" as never);
      }
    }
    /* Version 3 gave every symbol a record; version 4 takes that back for ordinary
       appointments, which carry their symbols directly again, and keeps records only
       for what is genuinely an object: the cards a choice offers. */
    if (from < 4) {
      database.createObjectStore("cards", { keyPath: "id" });
      if (from >= 1) {
        const store = transaction.objectStore("appointments");
        type Loose = Appointment & { symbols?: SymbolRef[]; activities?: unknown; options?: unknown };
        const seen = new Map<string, string>();
        const cardFor = (ref: SymbolRef) => {
          const key = `${ref.source}:${ref.id}`;
          if (!seen.has(key)) {
            const id = crypto.randomUUID();
            seen.set(key, id);
            transaction.objectStore("cards").put({ id, name: ref.label, symbol: ref, tone: TONES[seen.size % TONES.length], updatedAt: Date.now() });
          }
          return seen.get(key)!;
        };
        /* A v3 database keeps its pictures in an `activities` store; a v1/v2 one
           keeps them on the appointment. Both end up as inline symbols. */
        const older = from === 3
          ? new Map((await (transaction.objectStore("activities" as never) as unknown as { getAll(): Promise<{ id: string; symbol?: SymbolRef }[]> }).getAll()).map(item => [item.id, item.symbol]))
          : new Map<string, SymbolRef | undefined>();
        for (const old of (await store.getAll()) as Loose[]) {
          const symbols: SymbolRef[] = from === 3
            ? ((old.activities ?? []) as string[]).map(id => older.get(id)).filter(Boolean) as SymbolRef[]
            : (old.symbols ?? []);
          const offered = ((old.options ?? []) as unknown[]).map(option =>
            typeof option === "string" ? older.get(option) : option as SymbolRef).filter(Boolean) as SymbolRef[];
          store.put({ ...old, symbols, options: offered.map(cardFor), chosen: undefined, activities: undefined } as Appointment);
        }
        if (from === 3) database.deleteObjectStore("activities" as never);
      }
    }
  },
}));

export const uuid = () => crypto.randomUUID();

/** One week is a range over the date index, not a filter over everything. */
export async function week(monday: Date): Promise<Appointment[]> {
  const from = iso(monday), to = iso(addDays(monday, 6));
  return (await db()).getAllFromIndex("appointments", "date", IDBKeyRange.bound(from, to));
}
export const allPeople = async () => (await db()).getAll("people");
export const allSeries = async () => (await db()).getAll("series");
export const inSeries = async (id: string) => (await db()).getAllFromIndex("appointments", "series", id);
export async function put(appointment: Appointment): Promise<void> {
  await (await db()).put("appointments", { ...appointment, updatedAt: Date.now() });
}
export const remove = async (id: string) => (await db()).delete("appointments", id);
export const putPerson = async (person: Person) => { await (await db()).put("people", person); };
export const removePerson = async (id: string) => (await db()).delete("people", id);
export const allCards = async () => (await db()).getAll("cards");
export const putCard = async (card: Card) => { await (await db()).put("cards", { ...card, updatedAt: Date.now() }); };
export const removeCard = async (id: string) => (await db()).delete("cards", id);

/* Setting a birthday writes the appointments it produces — a century of all-day
   entries carrying that person, and nothing else. Changing it replaces the batch. */
export async function setBirthday(person: Person, birthday: string | undefined): Promise<void> {
  if (person.birthdaySeries) await dropSeries(person.birthdaySeries);
  if (!birthday) return void putPerson({ ...person, birthday: undefined, birthdaySeries: undefined });
  const until = `${Number(birthday.slice(0, 4)) + 100}${birthday.slice(4)}`;
  const series = await createSeries({ kind: "yearly" }, birthday, until,
    { symbols: [], options: [], people: [person.id], showPeople: true });
  await putPerson({ ...person, birthday, birthdaySeries: series });
}

/** An input picked one of the options this appointment offers. */
export async function choose(id: string, option: string): Promise<void> {
  const database = await db();
  const appointment = await database.get("appointments", id);
  if (!appointment || !appointment.options.includes(option)) return;
  await database.put("appointments", { ...appointment, chosen: option, updatedAt: Date.now() });
}

/* Creating a series writes the appointments, concretely and once. The series record
   only remembers how, so the batch can be listed, extended and cleared later. */
export async function createSeries(pattern: Pattern, from: string, until: string, shape: Omit<Appointment, "id" | "date" | "series" | "updatedAt">): Promise<string> {
  const database = await db();
  const id = uuid();
  const dates = occurrences(pattern, from, until);
  await database.put("series", { id, pattern, from, until, allDay: !shape.start, createdAt: Date.now() });
  const writing = database.transaction("appointments", "readwrite");
  await Promise.all([
    ...dates.map(date => writing.store.put({ ...shape, id: uuid(), date, series: id, updatedAt: Date.now() })),
    writing.done,
  ]);
  return id;
}

/** How many of a series a reach would touch, so the person is told before it happens. */
export async function reachOf(series: string, from?: string): Promise<Appointment[]> {
  const all = await inSeries(series);
  return from ? all.filter(appointment => appointment.date >= from) : all;
}
export async function dropSeries(series: string, from?: string): Promise<number> {
  const database = await db();
  const touched = await reachOf(series, from);
  const writing = database.transaction("appointments", "readwrite");
  await Promise.all([...touched.map(appointment => writing.store.delete(appointment.id)), writing.done]);
  if (!from || !(await inSeries(series)).length) await database.delete("series", series);
  return touched.length;
}
export async function editSeries(series: string, change: Partial<Appointment>, from?: string): Promise<number> {
  const database = await db();
  const touched = await reachOf(series, from);
  const writing = database.transaction("appointments", "readwrite");
  await Promise.all([...touched.map(appointment => writing.store.put({ ...appointment, ...change, id: appointment.id, date: appointment.date, series, updatedAt: Date.now() })), writing.done]);
  return touched.length;
}

const metacom = (id: string, label: string): SymbolRef => ({ source: "metacom", id, label });
const symbols = {
  breakfast: metacom("Lebensmittel_Essen/fruehstueck2.png", "Frühstück"),
  clothes: metacom("Verben/anziehen1.png", "anziehen"),
  bike: metacom("Fahrzeuge/fahrrad.png", "Fahrrad"),
  kita: metacom("Berufe/kindergaertnerin.png", "Kita"),
  play: metacom("Spielen/spielplatz.png", "Spielplatz"),
  shop: metacom("Einkaufen/einkaufen.png", "einkaufen"),
  lunch: metacom("Lebensmittel_Essen/mittagessen.png", "Essen"),
  cook: metacom("Lebensmittel_Essen/abendessen.png", "kochen"),
  pajamas: metacom("Kleidung_Accessoires/schlafanzug.png", "Schlafanzug"),
  teeth: metacom("Koerperpflege/zaehneputzen.png", "Zähne putzen"),
  sleep: metacom("Verben/schlafen1.png", "schlafen"),
  speech: metacom("Therapie/sprachtherapielogopaedie.png", "Logopädie"),
  early: metacom("Therapie/fruehfoerderung.png", "Frühförderung"),
  bricks: metacom("Spielen/bausteinespielen.png", "Bausteine"),
  book: metacom("Buch_Zeitung/bilderbuch.png", "Bilderbuch"),
  ball: metacom("Spielen/ballspielen.png", "Ball"),
} as const;

/* A household routine, written once so an empty database still shows a week — and
   written as activities and series, because that is how a household actually plans.
   Real planning replaces it; nothing else in the app knows this exists. */
export async function seed(around: Date): Promise<void> {
  const database = await db();
  if (await database.count("appointments")) return;
  const people: Person[] = [
    { id: "bente", name: "Testperson", initials: "BE", tone: "#b8460f" },
    { id: "mika", name: "Testperson", initials: "MI", tone: "#1d5fb0" },
    { id: "mama", name: "Mama", initials: "MA", tone: "#7b3fa0" },
    { id: "papa", name: "Papa", initials: "PA", tone: "#0f6b62" },
    { id: "oma", name: "Oma", initials: "OM", tone: "#a3630c" },
    { id: "opa", name: "Opa", initials: "OP", tone: "#2d5c2a" },
  ];
  await Promise.all(people.map(person => database.put("people", person)));

  /* Ordinary appointments carry their symbols directly. */
  const sym = (path: string, label: string): SymbolRef => ({ source: "metacom", id: path, label });
  const breakfast = sym("Lebensmittel_Essen/fruehstueck2.png", "Frühstück");
  const clothes = sym("Verben/anziehen1.png", "Anziehen");
  const bike = sym("Fahrzeuge/fahrrad.png", "Fahrrad fahren");
  const kita = sym("Berufe/kindergaertnerin.png", "Kita");
  const shop = sym("Einkaufen/einkaufen.png", "Einkaufen");
  const lunch = sym("Lebensmittel_Essen/mittagessen.png", "Essen");
  const cook = sym("Lebensmittel_Essen/abendessen.png", "Kochen");
  const pajamas = sym("Kleidung_Accessoires/schlafanzug.png", "Schlafanzug");
  const teeth = sym("Koerperpflege/zaehneputzen.png", "Zähne putzen");
  const sleep = sym("Verben/schlafen1.png", "Schlafen");
  const logo = sym("Therapie/sprachtherapielogopaedie.png", "Logopädie");
  const early = sym("Therapie/fruehfoerderung.png", "Frühförderung");

  /* What a choice offers is a set of cards: household objects with an NFC tag, a
     symbol and something to say when they are laid out. */
  let next = 0;
  const card = async (name: string, path: string, speech: string, nfc: string) => {
    const id = uuid();
    await database.put("cards", { id, name, symbol: sym(path, name), speech, nfc, tone: TONES[next++ % TONES.length], updatedAt: Date.now() });
    return id;
  };
  const playCard = await card("Spielplatz", "Spielen/spielplatz.png", "Wir gehen auf den Spielplatz.", "04A1B2C3");
  const bikeCard = await card("Fahrrad fahren", "Fahrzeuge/fahrrad.png", "Wir fahren Fahrrad.", "04A1B2C4");
  const bricksCard = await card("Bausteine", "Spielen/bausteinespielen.png", "Wir bauen mit Bausteinen.", "04A1B2C5");
  const bookCard = await card("Bilderbuch", "Buch_Zeitung/bilderbuch.png", "Wir schauen ein Buch an.", "04A1B2C6");

  type Shape = Omit<Appointment, "id" | "date" | "series" | "updatedAt">;
  const timed = (start: string, end: string, fixed: SymbolRef[], extra: Partial<Shape> = {}): Shape =>
    ({ start, end, symbols: fixed, options: [], people: [], showPeople: false, ...extra });
  const whole = (fixed: SymbolRef[], who: string[]): Shape =>
    ({ symbols: fixed, options: [], people: who, showPeople: true });

  const monday = mondayOf(around);
  const from = iso(monday), until = iso(addDays(monday, 55));
  const on = (...weekdays: number[]): Pattern => ({ kind: "weekly", weekdays });
  const workdays = on(0, 1, 2, 3, 4), weekend = on(5, 6), twice = on(1, 3), daily = on(0, 1, 2, 3, 4, 5, 6);

  await Promise.all([
    createSeries(workdays, from, until, timed("07:15", "07:45", [breakfast])),
    createSeries(workdays, from, until, timed("07:45", "08:25", [clothes])),
    createSeries(workdays, from, until, timed("08:30", "08:45", [bike])),
    createSeries(workdays, from, until, timed("08:45", "14:00", [kita])),
    createSeries(workdays, from, until, timed("14:00", "18:00", [sym("Spielen/spielplatz.png", "Spielplatz")])),
    createSeries(twice, from, until, timed("11:00", "11:45", [logo], { people: ["bente"], showPeople: true })),
    createSeries(on(3), from, until, timed("12:00", "13:15", [early], { people: ["bente"], showPeople: true })),
    createSeries(weekend, from, until, timed("08:00", "08:40", [breakfast])),
    createSeries(weekend, from, until, timed("08:40", "09:20", [clothes])),
    createSeries(weekend, from, until, timed("12:00", "13:00", [lunch])),
    createSeries(weekend, from, until, timed("14:00", "18:00", [], { options: [playCard, bikeCard] })),
    createSeries(on(5), from, until, timed("10:00", "11:30", [shop], { people: ["mama", "bente"], showPeople: true })),
    createSeries(on(6), from, until, timed("10:00", "12:00", [], { options: [bricksCard, bookCard, playCard] })),
    createSeries(daily, from, until, timed("18:00", "18:30", [cook])),
    createSeries(daily, from, until, timed("18:30", "19:15", [lunch])),
    createSeries(daily, from, until, timed("19:30", "20:15", [pajamas, teeth, sleep])),
    /* A visit is an ordinary all-day appointment carrying the guests. */
    createSeries({ kind: "daily" }, iso(addDays(monday, 5)), iso(addDays(monday, 6)), whole([], ["oma", "opa"])),
  ]);
  /* A birthday is a date on a person; the appointments follow from it. */
  await setBirthday(people[1], iso(addDays(monday, 6)));
}
