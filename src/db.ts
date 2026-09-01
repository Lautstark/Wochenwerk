import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { addDays, iso, mondayOf, occurrences, TONES, type Card, type Appointment, type Pattern, type Person, type Series, type Settings, type SymbolRef } from "./model.js";

/* IndexedDB through `idb`, a store per kind with real indexes — the family's
   convention, and the shape a folder of one file per record maps onto when the
   store moves there. See ADR 002. */
interface Wochenwerk extends DBSchema {
  appointments: { key: string; value: Appointment; indexes: { date: string; series: string } };
  series: { key: string; value: Series };
  people: { key: string; value: Person };
  cards: { key: string; value: Card };
  /* One record under one key. A store with a single row reads oddly until you try
     the alternative: a preference kept anywhere else is a preference restored from
     one place and overwritten from another. conventions.md §1.2. */
  settings: { key: typeof SETTINGS; value: Settings };
}
const SETTINGS = "settings";

/* Version 2 dropped the separate visit/birthday record. Both are ordinary all-day
   appointments now: the person hangs off the appointment like on any other, and a
   birthday's crown became the symbol it always should have been. */
type OldSpecial = { id: string; kind: "visit" | "birthday"; person: string; from: string; to: string };
const cake: SymbolRef = { source: "metacom", id: "Feste/geburtstag.png", label: "Geburtstag" };

let opening: Promise<IDBPDatabase<Wochenwerk>> | null = null;
const db = () => (opening ??= openDB<Wochenwerk>("wochenwerk", 6, {
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
    /* Version 5 empties what version 4 and earlier were seeded with. The mock
       household routine is gone from the code, and a database still holding it
       cannot be told apart from one somebody filled — so the one that predates
       the removal is cleared and the household starts on its own week. */
    if (from > 0 && from < 5) {
      for (const store of ["appointments", "series", "cards", "people"] as const) transaction.objectStore(store).clear();
    }
    /* Version 6 gives the household somewhere to keep what it has chosen: one
       record, out-of-line under its own name, holding every preference there is.
       Nothing is carried across, because nothing was ever kept anywhere else. */
    if (from < 6) database.createObjectStore(SETTINGS);
  },
}));

export const uuid = () => crypto.randomUUID();

/** What the household has chosen, all of it, or an empty record on a first run. */
export async function settings(): Promise<Settings> {
  return (await (await db()).get(SETTINGS, SETTINGS)) ?? {};
}
export async function saveSettings(value: Settings): Promise<void> {
  await (await db()).put(SETTINGS, value, SETTINGS);
}

/*
 * The Azure Speech key, and what keeping it here means.
 *
 * It never leaves this browser. The request for a voice goes from the tab
 * straight to Microsoft and the audio comes straight back; nothing passes
 * through a server of ours, because there is not one. What is stored is what
 * somebody typed into their own browser on their own machine — the same
 * exposure as the `.env` file it replaces.
 *
 * That is safe *because* of who typed it. A key baked into a build would not
 * be: a page served to anyone else hands its key to everyone who opens it, and
 * nothing in the page can tell the two apart. stimmquelle's CONTRACT.md §8 is
 * the reasoning, and it is why there is a field to type into rather than a
 * constant in this repository.
 */
export async function saveAzure(azure: Settings["azure"]): Promise<void> {
  const now = await settings();
  if (!azure) {
    const { azure: _forgotten, ...rest } = now;
    return saveSettings(rest);
  }
  await saveSettings({ ...now, azure });
}

/** One week is a range over the date index, not a filter over everything. */
export async function week(monday: Date): Promise<Appointment[]> {
  const from = iso(monday), to = iso(addDays(monday, 6));
  return (await db()).getAllFromIndex("appointments", "date", IDBKeyRange.bound(from, to));
}
export const allPeople = async () => (await db()).getAll("people");
export const allSeries = async () => (await db()).getAll("series");
/** A batch in the order it runs. The index answers by key, which is a UUID. */
export const inSeries = async (id: string) =>
  (await (await db()).getAllFromIndex("appointments", "series", id)).sort((a, b) => a.date.localeCompare(b.date));
export async function put(appointment: Appointment): Promise<void> {
  await (await db()).put("appointments", { ...appointment, updatedAt: Date.now() });
}
export const remove = async (id: string) => (await db()).delete("appointments", id);

/** Empty the calendar. Cards, people and their birthdays stay. */
export async function clearAppointments(): Promise<number> {
  const database = await db();
  const many = await database.count("appointments");
  await database.clear("appointments");
  await database.clear("series");
  const everyone = await database.getAll("people");
  await Promise.all(everyone.filter(person => person.birthdaySeries)
    .map(person => database.put("people", { ...person, birthdaySeries: undefined })));
  return many;
}

/** Everything: the calendar, the cards and the people. Nothing is left behind. */
export async function clearAll(): Promise<void> {
  const database = await db();
  await Promise.all([
    database.clear("appointments"), database.clear("series"),
    database.clear("cards"), database.clear("people"),
  ]);
}
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
/** Move where a batch stops: write what is missing, drop what is now past the end. */
export async function reboundSeries(series: string, until: string): Promise<{ added: number; dropped: number }> {
  const database = await db();
  const record = await database.get("series", series);
  if (!record) return { added: 0, dropped: 0 };
  const existing = await inSeries(series);
  const wanted = new Set(occurrences(record.pattern, record.from, until));
  const shape = existing[0];
  const gone = existing.filter(appointment => !wanted.has(appointment.date));
  const missing = [...wanted].filter(date => !existing.some(appointment => appointment.date === date));
  const writing = database.transaction("appointments", "readwrite");
  await Promise.all([
    ...gone.map(appointment => writing.store.delete(appointment.id)),
    ...(shape ? missing.map(date => writing.store.put({ ...shape, id: uuid(), date, series, updatedAt: Date.now() })) : []),
    writing.done,
  ]);
  await database.put("series", { ...record, until });
  return { added: missing.length, dropped: gone.length };
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
