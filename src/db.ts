import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { addDays, iso, occurrences, type Card, type Appointment, type Pattern, type Person, type Series, type Settings, type SymbolRef } from "./model.js";

/* IndexedDB through `idb`, a store per kind with real indexes — the family's
   convention, and the shape a folder of one file per record maps onto when the
   store moves there. See ADR 002. */
interface Wochenwerk extends DBSchema {
  appointments: { key: string; value: Appointment; indexes: { date: string; series: string } };
  series: { key: string; value: Series };
  people: { key: string; value: Person };
  cards: { key: string; value: Card };
  /* Not a kind of thing: one record holding what was set up once. Keyed like the
     rest so the store is one of the family, and there is only ever the one key. */
  settings: { key: string; value: Settings & { id: string } };
  /* Spoken audio under stimmquelle's own name for it. A cache and nothing more:
     losing it costs the time to speak a sentence again, and every key in it is
     derivable from the text, so nothing here is a source of anything. */
  clips: { key: string; value: { id: string; wav: Uint8Array } };
}

/* Version 2 dropped the separate visit/birthday record. Both are ordinary all-day
   appointments now: the person hangs off the appointment like on any other, and a
   birthday's crown became the symbol it always should have been. */
type OldSpecial = { id: string; kind: "visit" | "birthday"; person: string; from: string; to: string };
const cake: SymbolRef = { source: "metacom", id: "Feste/geburtstag.png", label: "Geburtstag" };

const WAITING = "Die Datenbank wird von einem anderen Tab offen gehalten. Diese Seite neu laden.";
/* A route says where that belongs on its own screen. The store does not own any
   UI and is not about to start, but it is the only thing that knows. */
let stuck: ((words: string) => void) | null = null;
export const whenStuck = (say: (words: string) => void) => { stuck = say; };

let opening: Promise<IDBPDatabase<Wochenwerk>> | null = null;
/* Say so if it has not opened by now. `blocked` below is the callback for this and
   it is not enough on its own: a request queued behind an upgrade another tab is
   holding can simply never settle and never fire it either — observed, with the
   board blank and nothing anywhere but a hang. Everything on both routes waits on
   this promise, so whatever the reason, not having opened by now is the thing
   worth saying, and the only screen that can say it is the one being looked at. */
const PATIENCE = 4000;
const db = () => (opening ??= waiting(openDB<Wochenwerk>("wochenwerk", 7, {
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
            transaction.objectStore("cards").put({ id, name: ref.label, symbol: ref, updatedAt: Date.now() });
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
    /* Version 6 is the first store that is not a kind of record: one settings
       record, holding every preference the household has. See Settings.

       Asked of the database rather than of `from`, and that is the one branch here
       that is not a version check. Two settings panels were written in parallel —
       the voice and the Azure key — and both had to bump to 6 to have a record to
       write into. A browser that has already run one of them is *at* 6, so the
       other's `if (from < 6)` never runs on it and its store is silently absent
       until something reaches for it. Whoever merges second still has to bump the
       version, but this is the half that does not depend on anybody noticing. */
    if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings", { keyPath: "id" });
    if (!database.objectStoreNames.contains("clips")) database.createObjectStore("clips", { keyPath: "id" });
  },
  /* A version bump waits for every open connection to close, and the board is a
     page that is never closed: it hangs on a wall. Without these three, deploying
     a new version leaves the calendar's upgrade waiting on the board forever, with
     nothing on either screen saying so — the failure looks like a page that simply
     stopped loading.

     `blocking` is the one that fixes it: it fires on the *old* connection, which
     closes so the upgrade can proceed and reloads into the version that wanted it.
     This is a display with nothing unsaved in it, so reloading costs nothing and
     is what somebody would do by hand anyway. It only helps once a build carrying
     it is the one running, so the first deploy after this still wants the board
     reloaded by hand; every one after it does not. */
  blocking(_current, _blocked, event) {
    (event.target as IDBDatabase | null)?.close();
    opening = null;
    globalThis.location?.reload();
  },
  /* We are the one waiting, on a tab too old to carry the handler above. Said out
     loud rather than hung on, because the two are indistinguishable from a screen
     — and the console is not a screen. Nothing resolves while a bump is blocked,
     so a board left to itself simply stays blank; whoever is looking at it has to
     be told on the board. */
  blocked() {
    console.warn(`Wochenwerk: ${WAITING}`);
    stuck?.(WAITING);
  },
  /* The browser dropped the connection — a phone reclaiming memory, usually. Drop
     the cached promise so the next call opens a live one instead of reusing a
     handle every query now fails on. */
  terminated() { opening = null; },
})));

function waiting(opened: Promise<IDBPDatabase<Wochenwerk>>): Promise<IDBPDatabase<Wochenwerk>> {
  const timer = setTimeout(() => stuck?.(WAITING), PATIENCE);
  void opened.then(() => clearTimeout(timer), () => clearTimeout(timer));
  return opened;
}

export const uuid = () => crypto.randomUUID();

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
/* One household, so one record, under a constant key. A settings store keyed by
   anything else would be a store of settings, which is how a second answer to the
   same preference gets written and then read by whichever half asks first. */
const ONLY = "household";
export async function settings(): Promise<Settings> {
  const { id: _, ...saved } = (await (await db()).get("settings", ONLY)) ?? { id: ONLY };
  return saved;
}
/** Merge, never replace: two panels write different halves of the one record. */
export async function saveSettings(change: Partial<Settings>): Promise<Settings> {
  const next = { ...(await settings()), ...change };
  await (await db()).put("settings", { ...next, id: ONLY });
  return next;
}
/** The voice the whole calendar speaks in — a stimmquelle voice id. */
export const saveVoice = async (voice: string) => { await saveSettings({ voice }); };

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
 *
 * Forgetting it writes `undefined` rather than deleting a property, because the
 * record is merged and not replaced: absent and undefined read the same to
 * everything that asks, and only a merge can say "gone".
 */
export const saveAzure = async (azure: Settings["azure"]) => { await saveSettings({ azure }); };

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

/* Turning an appointment that already exists into a batch adopts the record rather
   than replacing it: its id is what the week on screen already holds, and a choice
   resolved on it stays resolved. The rest of the batch is written around it, and
   the copies start undecided — a choice belongs to its own day.

   A pattern that does not fall on this appointment's own weekday leaves it behind:
   what was asked for is the batch, not the batch and the appointment. */
export async function seriesFrom(appointment: Appointment, pattern: Pattern, until: string): Promise<string> {
  const database = await db();
  const id = uuid();
  const stop = until < appointment.date ? appointment.date : until;
  const dates = occurrences(pattern, appointment.date, stop);
  const now = Date.now();
  await database.put("series", { id, pattern, from: appointment.date, until: stop, allDay: !appointment.start, createdAt: now });
  const writing = database.transaction("appointments", "readwrite");
  await Promise.all([
    ...dates.map(date => writing.store.put(date === appointment.date
      ? { ...appointment, series: id, updatedAt: now }
      : { ...appointment, id: uuid(), date, series: id, chosen: undefined, updatedAt: now })),
    ...(dates.includes(appointment.date) ? [] : [writing.store.delete(appointment.id)]),
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
/* Reshaping a batch — a new rule, a new end, or both — is one piece of arithmetic
   either way: which days the rule now covers, which records already sit on them,
   and what the difference costs. It is asked for first and applied second, so the
   count can be put in front of somebody before anything is written.

   Nothing before `from` is looked at, let alone rewritten. What the board showed in
   September is what was planned in September, and a rule changed in October does
   not reach back for it. */
export type Reshape = { adding: string[]; dropping: Appointment[] };

export async function reshapeOf(series: string, pattern: Pattern, from: string, until: string): Promise<Reshape> {
  const ahead = (await inSeries(series)).filter(appointment => appointment.date >= from);
  const wanted = new Set(occurrences(pattern, from, until < from ? from : until));
  const have = new Set(ahead.map(appointment => appointment.date));
  return {
    adding: [...wanted].filter(date => !have.has(date)),
    dropping: ahead.filter(appointment => !wanted.has(appointment.date)),
  };
}

/** Apply one. `like` is the appointment the days that are new get written from. */
export async function repattern(series: string, pattern: Pattern, from: string, until: string, like: Appointment): Promise<Reshape> {
  const database = await db();
  const record = await database.get("series", series);
  if (!record) return { adding: [], dropping: [] };
  const stop = until < from ? from : until;
  const change = await reshapeOf(series, pattern, from, stop);
  const now = Date.now();
  const writing = database.transaction("appointments", "readwrite");
  await Promise.all([
    ...change.dropping.map(appointment => writing.store.delete(appointment.id)),
    /* A day nobody had yet is written from the appointment somebody has open, not
       from the first of the batch: that one may carry an edit of its own, and it is
       not the one being looked at. Undecided, because a choice belongs to its day.
       A day that survives is left alone entirely, edits and all. */
    ...change.adding.map(date => writing.store.put({ ...like, id: uuid(), date, series, chosen: undefined, updatedAt: now })),
    writing.done,
  ]);
  /* The record describes the stretch it still governs, so `from` moves to the day
     the new rule starts. That is what keeps the untouched past out of every later
     reshape — and what lies there keeps the batch id, so it stays listable as one. */
  await database.put("series", { ...record, pattern, from, until: stop, allDay: !like.start });
  return change;
}

export async function editSeries(series: string, change: Partial<Appointment>, from?: string): Promise<number> {
  const database = await db();
  const touched = await reachOf(series, from);
  const writing = database.transaction("appointments", "readwrite");
  await Promise.all([...touched.map(appointment => {
    /* What was chosen belongs to the day it was chosen on, so a change over a batch
       never carries one across — `change` is written without it. It can still take
       one away, though: a card that is no longer offered is not an answer, and
       leaving it there would read as decided. */
    const chosen = appointment.chosen && change.options && !change.options.includes(appointment.chosen)
      ? undefined : appointment.chosen;
    return writing.store.put({ ...appointment, ...change, chosen, id: appointment.id, date: appointment.date, series, updatedAt: Date.now() });
  }), writing.done]);
  return touched.length;
}

/* The store stimmquelle's `remember` keeps spoken audio in. It owns the name —
   the §3 fingerprint over the text, the voice and the output settings — and this
   owns the lifetime, which is what that split is for: these bytes can always be
   made again, so a failing write is a slow board and never a lost recording. */
export const clips = {
  async get(id: string) { return (await (await db()).get("clips", id))?.wav; },
  async put(id: string, wav: Uint8Array) {
    try { await (await db()).put("clips", { id, wav }); }
    catch { /* A full quota costs the time to speak it again, and nothing else. */ }
  },
};
/** Forget every spoken clip. They come back on their own, one sentence at a time. */
export const forgetClips = async () => (await db()).clear("clips");
