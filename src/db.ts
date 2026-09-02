import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { adopt, adopted, file, isStore, KINDS, pushKind, readKind, unfile } from "./folder.js";
import { addDays, cameFrom, expand, iso, isDerived, notAtHome, occurrences, type Card, type Appointment, type Pattern, type Person, type Series, type Settings, type Shape, type SymbolRef } from "./model.js";
import { changes } from "@lautstark/werkzeuge/changed";

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
const db = () => (opening ??= waiting(openDB<Wochenwerk>("wochenwerk", 8, {
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
          transaction.objectStore("series").put({
            id, pattern: { kind: "daily" }, from: special.from, until: special.to,
            shape: { symbols: special.kind === "birthday" ? [cake] : [], options: [], people: [special.person], showPeople: true },
            skipped: [], allDay: true, createdAt: Date.now(), updatedAt: Date.now(),
          });
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
    /* Version 8 stopped writing a series out day by day. What is already written
       out is read back into the rule it came from: the shape is what its days have
       in common, the days the rule covers and nobody kept are `skipped`, and a day
       that differs from the shape stays a record, because that is what it is.

       Nothing is deleted that is not first accounted for. A day identical to what
       the rule would draw is redundant and goes; anything else stays. That is the
       difference between a migration and losing three thousand records. */
    if (from >= 2 && from < 8) {
      const appointments = transaction.objectStore("appointments");
      const batches = transaction.objectStore("series");
      for (const record of await batches.getAll()) {
        const days = (await appointments.index("series").getAll(record.id)).sort((a, b) => a.date.localeCompare(b.date));
        if (!days.length) { await batches.put({ ...record, shape: { symbols: [], options: [], people: [], showPeople: false }, skipped: [] }); continue; }
        const { id: _id, date: _date, series: _series, chosen: _chosen, updatedAt: _at, ...shape } = days[0];
        const had = new Set(days.map(day => day.date));
        const rule = { ...record, shape, skipped: occurrences(record.pattern, record.from, record.until).filter(date => !had.has(date)) };
        await batches.put(rule);
        const same = (day: Appointment) => !day.chosen
          && JSON.stringify({ ...day, id: 0, date: 0, series: 0, updatedAt: 0 }) === JSON.stringify({ ...shape, id: 0, date: 0, series: 0, updatedAt: 0 });
        for (const day of days) if (same(day)) await appointments.delete(day.id);
      }
    }
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

/* Where a write says that it happened. conventions.md §2.2: every write that
   changes what a Sicherung holds says so *at the write*, not at the call site
   that happened to make it — a page-level "something probably changed" is the
   version that misses the write somebody adds next year. The two funnels below
   are the only mutations there are, so this is one call site each. */
const changed = changes();
export const onChanged = changed.onChanged;

/* Every mutation goes through these two, so a household that has connected a
   folder never has a record in one place and not the other. Where no folder is
   connected they write to IndexedDB and stop, which is the same code path with
   the second half doing nothing. See src/folder.ts. */
const KIND = { appointments: "termine", cards: "karten", people: "personen", series: "serien" } as const;
type Kept = keyof typeof KIND;

async function keep<T extends { id: string; updatedAt: number }>(store: Kept, record: T): Promise<void> {
  await (await db()).put(store as never, record as never);
  await file(KIND[store], record as never);
  changed.touched();
}
async function dropRecord(store: Kept, id: string): Promise<void> {
  await (await db()).delete(store as never, id as never);
  await unfile(KIND[store], id);
  changed.touched();
}

/* A stretch of days is what was stored for them plus what the rules put there.

   The stored ones come first and win: an appointment that carries a series is an
   occurrence somebody edited, and it stands in for the day the rule would have
   drawn. Everything else is arithmetic over a handful of days, which is nothing.

   A week is the one the board draws; the announcement asks for a longer stretch,
   because the one thing it says about a day that is not on screen is that we
   will not be here. */
export async function between(from: string, to: string): Promise<Appointment[]> {
  const database = await db();
  const stored = await database.getAllFromIndex("appointments", "date", IDBKeyRange.bound(from, to));
  const instead = new Set(stored.filter(item => item.series).map(item => `${item.series}@${item.date}`));
  const derived = (await database.getAll("series")).flatMap(series => expand(series, from, to));
  return [...stored, ...derived.filter(item => !instead.has(item.id))]
    .sort((a, b) => a.date.localeCompare(b.date));
}
export const week = (monday: Date): Promise<Appointment[]> => between(iso(monday), iso(addDays(monday, 6)));

/** The first day inside a stretch that the household spends somewhere else. */
/* Asked of the store rather than worked out from a week, because the day the
   announcement is about is usually not on the board at all. How far ahead to
   look is the announcement's rule and is handed in; which days are away days is
   this file's, and it is the same merge as any other range — a rule's days
   included, an edited day standing in for the one it replaced, and a deleted one
   gone. */
export async function awayAhead(from: string, to: string): Promise<string | undefined> {
  if (to < from) return undefined;
  return (await between(from, to)).filter(notAtHome).map(item => item.date).sort()[0];
}
const dayBefore = (date: string) => iso(addDays(new Date(`${date}T00:00`), -1));
const shapeOf = ({ id: _id, date: _date, series: _series, chosen: _chosen, updatedAt: _at, ...rest }: Appointment): Shape => rest;
const overridesOf = async (series: string) => (await db()).getAllFromIndex("appointments", "series", series);
/** Take a date out of a rule, so the day the rule covered stops appearing. */
async function skip(series: string, date: string): Promise<void> {
  const record = await (await db()).get("series", series);
  if (!record || record.skipped.includes(date)) return;
  await keep("series", { ...record, skipped: [...record.skipped, date], updatedAt: Date.now() });
}
export const allPeople = async () => (await db()).getAll("people");
const allAppointments = async () => (await db()).getAll("appointments");
/** Mirror what a batch left behind. Cheap where no folder is connected. */
const mirror = async (...kinds: ("termine" | "serien")[]) => {
  for (const kind of kinds) {
    await pushKind(kind, kind === "termine" ? await allAppointments() : await allSeries());
  }
};
export const allSeries = async () => (await db()).getAll("series");
/** A batch in the order it runs: the days somebody changed, and the days the rule
    still governs on its own. */
export async function inSeries(id: string): Promise<Appointment[]> {
  const record = await (await db()).get("series", id);
  if (!record) return [];
  const changed = await overridesOf(id);
  const instead = new Set(changed.map(item => item.date));
  return [...changed, ...expand(record, record.from, record.until).filter(item => !instead.has(item.date))]
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* Editing one day of a batch is what makes that day concrete: it stops being
   arithmetic and becomes a record, which is exactly what happened to it. */
export async function put(appointment: Appointment): Promise<void> {
  const record = isDerived(appointment.id) ? { ...appointment, id: uuid() } : appointment;
  await keep("appointments", { ...record, updatedAt: Date.now() });
}

/* Deleting one day of a batch takes that date out of the rule — and does so for a
   day that had been edited too. Dropping the record alone would let the rule draw
   the day again, which reads as a deletion that did not happen. */
export async function remove(id: string): Promise<void> {
  if (isDerived(id)) { const { series, date } = cameFrom(id); return skip(series, date); }
  const appointment = await (await db()).get("appointments", id);
  await dropRecord("appointments", id);
  if (appointment?.series) await skip(appointment.series, appointment.date);
}

/* Where a folder is the store, the folder is the truth: on start it is read and
   the browser's copy is replaced wholesale. A replace needs no reconciliation and
   no tombstones — it is not a merge — which is the whole reason two-way sync is
   not being attempted.

   But it only replaces a folder that has finished becoming the store. A folder
   halfway through adoption, or one that was picked by mistake, holds fewer
   records than the browser does, and reading that back is indistinguishable from
   "everything was deleted elsewhere". It is not the same thing, and guessing cost
   somebody their calendar once. So the marker decides, and its absence means the
   folder is not read. See sicherung's adr/0001. */
export async function pullFromFolder(): Promise<boolean> {
  if (!isStore() || !(await adopted())) return false;
  await pull();
  return true;
}
async function pull(): Promise<void> {
  const database = await db();
  const [appointments, cards, people, series] = await Promise.all([
    readKind<Appointment>("termine"), readKind<Card>("karten"),
    readKind<Person>("personen"), readKind<Series>("serien"),
  ]);
  const writing = database.transaction(["appointments", "cards", "people", "series"], "readwrite");
  await Promise.all([
    writing.objectStore("appointments").clear(), writing.objectStore("cards").clear(),
    writing.objectStore("people").clear(), writing.objectStore("series").clear(),
  ]);
  await Promise.all([
    ...appointments.map(record => writing.objectStore("appointments").put(record)),
    ...cards.map(record => writing.objectStore("cards").put(record)),
    ...people.map(record => writing.objectStore("people").put(record)),
    ...series.map(record => writing.objectStore("series").put(record)),
    writing.done,
  ]);
}

/* Connecting a folder for the first time is the migration with a before and an
   after. A folder that is already a store replaces what this browser holds; one
   that is not adopts what this browser holds, and the package writes everything,
   checks it landed and only then marks it. Which happened is reported rather than
   assumed — the three are not interchangeable and somebody is entitled to know
   which one they got. */
export async function adoptFolder(): Promise<"pushed" | "pulled" | "incomplete"> {
  if (await adopted()) { await pullFromFolder(); return "pulled"; }
  const went = await adopt(await everything());
  if (!went.adopted) return went.reason === "already" ? "pulled" : "incomplete";
  return "pushed";
}

/** Everything this browser holds, by the name the folder files it under. */
const everything = async () => ({
  termine: await allAppointments(), serien: await allSeries(),
  karten: await allCards(), personen: await allPeople(),
});

/* A snapshot in a file.
 *
 * Not a second store and not a substitute for one: a folder is where the work
 * lives, and this is what survives a mistake the folder would faithfully carry
 * everywhere within seconds. It ages, which is the point — it is the state of an
 * afternoon, kept.
 *
 * What is in it is what a household made: the appointments, the rules behind
 * them, the cards and the people. What is not in it is this device's setup. A
 * speech key belongs to a machine and not to a calendar, and a file people send
 * each other is the last place for one. */
export const BACKUP = "wochenwerk";
export type Backup = { [BACKUP]: number; at: number; termine: Appointment[]; serien: Series[];
  karten: Card[]; personen: Person[] };

export async function exportAll(): Promise<Backup> {
  const [termine, serien, karten, personen] = await Promise.all([
    allAppointments(), allSeries(), allCards(), allPeople(),
  ]);
  return { [BACKUP]: 1, at: Date.now(), termine, serien, karten, personen };
}

export const isBackup = (data: unknown): data is Backup =>
  !!data && typeof data === "object" && typeof (data as Backup)[BACKUP] === "number";

/* Reading one adds and never overwrites — the rule the family's other products
   already follow, and the only one that is safe without asking a question per
   record. Somebody restoring into an empty calendar gets all of it back; somebody
   reading a file into a calendar they have kept working in gets what was missing
   and keeps what they wrote. */
export async function importAll(backup: Backup): Promise<number> {
  const database = await db();
  const have = {
    termine: new Set((await allAppointments()).map(item => item.id)),
    serien: new Set((await allSeries()).map(item => item.id)),
    karten: new Set((await allCards()).map(item => item.id)),
    personen: new Set((await allPeople()).map(item => item.id)),
  };
  const store = { termine: "appointments", serien: "series", karten: "cards", personen: "people" } as const;
  let added = 0;
  for (const kind of KINDS) {
    const coming = (backup[kind] ?? []).filter(record => record?.id && !have[kind].has(record.id));
    if (!coming.length) continue;
    const writing = database.transaction(store[kind], "readwrite");
    await Promise.all([...coming.map(record => writing.store.put(record as never)), writing.done]);
    added += coming.length;
  }
  await mirror("termine", "serien");
  await pushKind("karten", await allCards());
  await pushKind("personen", await allPeople());
  return added;
}

/** Empty the calendar./** Empty the calendar. Cards, people and their birthdays stay. */
export async function clearAppointments(): Promise<number> {
  const database = await db();
  const many = await database.count("appointments");
  await database.clear("appointments");
  await database.clear("series");
  const everyone = await database.getAll("people");
  await Promise.all(everyone.filter(person => person.birthdaySeries)
    .map(person => database.put("people", { ...person, birthdaySeries: undefined })));
  await mirror("termine", "serien");
  return many;
}

/** Everything: the calendar, the cards and the people. Nothing is left behind. */
export async function clearAll(): Promise<void> {
  const database = await db();
  await Promise.all([
    database.clear("appointments"), database.clear("series"),
    database.clear("cards"), database.clear("people"),
  ]);
  await mirror("termine", "serien");
  await pushKind("karten", []);
  await pushKind("personen", []);
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

export const putPerson = async (person: Person) => { await keep("people", { ...person, updatedAt: Date.now() }); };
export const removePerson = (id: string) => dropRecord("people", id);
export const allCards = async () => (await db()).getAll("cards");
export const putCard = async (card: Card) => { await keep("cards", { ...card, updatedAt: Date.now() }); };
export const removeCard = (id: string) => dropRecord("cards", id);

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

/* Creating a series writes the rule and nothing else. What used to be three
   thousand records is one, and the days it covers are worked out when they are
   read. */
export async function createSeries(pattern: Pattern, from: string, until: string, shape: Shape): Promise<string> {
  const id = uuid(), now = Date.now();
  await keep("series", { id, pattern, from, until, shape, skipped: [], allDay: !shape.start, createdAt: now, updatedAt: now });
  return id;
}

/* Turning an appointment that already exists into a batch keeps the record rather
   than dissolving it: its id is what the week on screen already holds, and a choice
   resolved on it stays resolved — so it stays stored, standing in for its own day.

   A pattern that does not fall on this appointment's own weekday leaves it behind:
   what was asked for is the batch, not the batch and the appointment. */
export async function seriesFrom(appointment: Appointment, pattern: Pattern, until: string): Promise<string> {
  const id = uuid(), now = Date.now();
  const stop = until < appointment.date ? appointment.date : until;
  const covered = occurrences(pattern, appointment.date, appointment.date).length > 0;
  await keep("series", { id, pattern, from: appointment.date, until: stop, shape: shapeOf(appointment),
    skipped: [], allDay: !appointment.start, createdAt: now, updatedAt: now });
  if (covered) await keep("appointments", { ...appointment, series: id, updatedAt: now });
  else await dropRecord("appointments", appointment.id);
  return id;
}

/** How many of a series a reach would touch, so the person is told before it happens. */
export async function reachOf(series: string, from?: string): Promise<Appointment[]> {
  const all = await inSeries(series);
  return from ? all.filter(appointment => appointment.date >= from) : all;
}
/* Removing a batch, or the tail of one, is a change to the rule and not a sweep
   over its days. Where it is cut, the rule stops there and the days before it stay
   exactly as they were — which is the same promise the old sweep made and had to
   spend thousands of deletes keeping. */
export async function dropSeries(series: string, from?: string): Promise<number> {
  const record = await (await db()).get("series", series);
  if (!record) return 0;
  const touched = await reachOf(series, from);
  for (const appointment of await overridesOf(series)) {
    if (!from || appointment.date >= from) await dropRecord("appointments", appointment.id);
  }
  if (!from || from <= record.from) await dropRecord("series", series);
  else await keep("series", { ...record, until: dayBefore(from),
    skipped: record.skipped.filter(date => date < from), updatedAt: Date.now() });
  return touched.length;
}
/* Reshaping a batch — a new rule, a new end, or both — is one piece of arithmetic
   either way: which days the rule now covers, which records already sit on them,
   and what the difference costs. It is asked for first and applied second, so the
   count can be put in front of somebody before anything is written.

   Nothing before `from` is looked at, let alone rewritten. What the board showed in
   September is what was planned in September, and a rule changed in October does
   not reach back for it. */
export type Reshape = { adding: string[]; dropping: Appointment[];
  /** Which batch governs the changed stretch afterwards — a cut leaves a new one. */
  series: string };

export async function reshapeOf(series: string, pattern: Pattern, from: string, until: string): Promise<Reshape> {
  const ahead = (await inSeries(series)).filter(appointment => appointment.date >= from);
  const wanted = new Set(occurrences(pattern, from, until < from ? from : until));
  const have = new Set(ahead.map(appointment => appointment.date));
  return {
    adding: [...wanted].filter(date => !have.has(date)),
    dropping: ahead.filter(appointment => !wanted.has(appointment.date)),
    series,
  };
}

/* Apply one — the rule, and only the rule. What a batch looks like is changed one
   step further down by `editSeries`, and the days a widened rule adds look like the
   batch they joined, because that is now the one place a batch's shape lives.

   A change that starts partway through splits the batch: the old record keeps the
   stretch it already governed and the new rule gets a record of its own. That is
   what "ab hier" has always meant, and it is now what is stored — one cut instead
   of rewriting every day after it. The days before the cut are not looked at, so
   what the board showed in September stays what was planned in September. */
export async function repattern(series: string, pattern: Pattern, from: string, until: string): Promise<Reshape> {
  const record = await (await db()).get("series", series);
  if (!record) return { adding: [], dropping: [], series };
  const stop = until < from ? from : until;
  const change = await reshapeOf(series, pattern, from, stop);
  const now = Date.now();
  /* A day that survives the new rule keeps its edits; a day the rule no longer
     covers loses the record that stood in for it. */
  for (const appointment of change.dropping) if (!isDerived(appointment.id)) await dropRecord("appointments", appointment.id);

  if (from <= record.from) {
    await keep("series", { ...record, pattern, from, until: stop,
      skipped: record.skipped.filter(date => date >= from && date <= stop), updatedAt: now });
    return change;
  }
  await keep("series", { ...record, until: dayBefore(from), skipped: record.skipped.filter(date => date < from), updatedAt: now });
  const id = uuid();
  await keep("series", { ...record, id, pattern, from, until: stop, skipped: [], createdAt: now, updatedAt: now });
  for (const appointment of await overridesOf(series)) {
    if (appointment.date >= from) await keep("appointments", { ...appointment, series: id, updatedAt: now });
  }
  return { ...change, series: id };
}

/* Changing what a batch looks like changes the rule, and the days that had been
   edited along with it — they are part of the batch, and a batch that changed
   shape everywhere except on the days somebody touched would be a strange thing to
   look at. From a date, the batch splits, exactly as a new rule does. */
export async function editSeries(series: string, change: Partial<Appointment>, from?: string): Promise<number> {
  const record = await (await db()).get("series", series);
  if (!record) return 0;
  const touched = await reachOf(series, from);
  const now = Date.now();
  const shape = { ...record.shape, ...shapeOf({ ...record.shape, ...change } as Appointment) };
  const target = !from || from <= record.from ? series : uuid();

  if (target === series) await keep("series", { ...record, shape, allDay: !shape.start, updatedAt: now });
  else {
    await keep("series", { ...record, until: dayBefore(from!), skipped: record.skipped.filter(date => date < from!), updatedAt: now });
    await keep("series", { id: target, pattern: record.pattern, from: from!, until: record.until, shape,
      skipped: record.skipped.filter(date => date >= from!), allDay: !shape.start, createdAt: now, updatedAt: now });
  }
  for (const appointment of await overridesOf(series)) {
    if (from && appointment.date < from) continue;
    /* What was chosen belongs to the day it was chosen on, so a change over a batch
       never carries one across — `change` is written without it. It can still take
       one away, though: a card that is no longer offered is not an answer, and
       leaving it there would read as decided. */
    const chosen = appointment.chosen && change.options && !change.options.includes(appointment.chosen)
      ? undefined : appointment.chosen;
    await keep("appointments", { ...appointment, ...change, chosen, id: appointment.id,
      date: appointment.date, series: target, updatedAt: now });
  }
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
