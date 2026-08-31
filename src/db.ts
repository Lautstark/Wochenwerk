import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { addDays, iso, mondayOf, type Appointment, type Person, type Special, type SymbolRef } from "./model.js";

/* IndexedDB through `idb`, a store per kind with real indexes — the family's
   convention, and the shape a folder of one file per record maps onto when the
   store moves there. See ADR 002. */
interface Wochenwerk extends DBSchema {
  appointments: { key: string; value: Appointment; indexes: { date: string } };
  people: { key: string; value: Person };
  specials: { key: string; value: Special };
}

let opening: Promise<IDBPDatabase<Wochenwerk>> | null = null;
const db = () => (opening ??= openDB<Wochenwerk>("wochenwerk", 1, {
  upgrade(database) {
    database.createObjectStore("appointments", { keyPath: "id" }).createIndex("date", "date");
    database.createObjectStore("people", { keyPath: "id" });
    database.createObjectStore("specials", { keyPath: "id" });
  },
}));

export const uuid = () => crypto.randomUUID();

/** One week is a range over the date index, not a filter over everything. */
export async function week(monday: Date): Promise<Appointment[]> {
  const from = iso(monday), to = iso(addDays(monday, 6));
  return (await db()).getAllFromIndex("appointments", "date", IDBKeyRange.bound(from, to));
}
export const allPeople = async () => (await db()).getAll("people");
export const allSpecials = async () => (await db()).getAll("specials");

export async function put(appointment: Appointment): Promise<void> {
  await (await db()).put("appointments", { ...appointment, updatedAt: Date.now() });
}
export const remove = async (id: string) => (await db()).delete("appointments", id);
export const putPerson = async (person: Person) => { await (await db()).put("people", person); };
export const putSpecial = async (special: Special) => { await (await db()).put("specials", special); };
export const removeSpecial = async (id: string) => (await db()).delete("specials", id);

/** An input picked one of the options this appointment offers. */
export async function choose(id: string, option: string): Promise<void> {
  const database = await db();
  const appointment = await database.get("appointments", id);
  if (!appointment || !appointment.options.some(candidate => candidate.id === option)) return;
  await database.put("appointments", { ...appointment, chosen: option, updatedAt: Date.now() });
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

/* A household routine, written once so an empty database still shows a week. Real
   planning replaces it; nothing else in the app knows this exists. */
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

  const at = (date: string, start: string, end: string, fixed: SymbolRef[], extra: Partial<Appointment> = {}): Appointment =>
    ({ id: uuid(), date, start, end, symbols: fixed, options: [], people: [], showPeople: false, updatedAt: Date.now(), ...extra });
  const monday = mondayOf(around);
  const written: Appointment[] = [];
  for (let index = 0; index < 7; index++) {
    const date = iso(addDays(monday, index));
    if (index < 5) {
      written.push(
        at(date, "07:15", "07:45", [symbols.breakfast]), at(date, "07:45", "08:25", [symbols.clothes]),
        at(date, "08:30", "08:45", [symbols.bike]), at(date, "08:45", "14:00", [symbols.kita]),
        at(date, "14:00", "18:00", [symbols.play]), at(date, "18:00", "18:30", [symbols.cook]),
        at(date, "18:30", "19:15", [symbols.lunch]), at(date, "19:30", "20:15", [symbols.pajamas, symbols.teeth, symbols.sleep]),
      );
      if (index === 1 || index === 3) written.push(at(date, "11:00", "11:45", [symbols.speech], { people: ["bente"], showPeople: true }));
      if (index === 3) written.push(at(date, "12:00", "13:15", [symbols.early], { people: ["bente"], showPeople: true }));
    } else {
      written.push(
        at(date, "08:00", "08:40", [symbols.breakfast]), at(date, "08:40", "09:20", [symbols.clothes]),
        at(date, "12:00", "13:00", [symbols.lunch]), at(date, "18:30", "19:15", [symbols.lunch]),
        at(date, "19:30", "20:15", [symbols.pajamas, symbols.teeth, symbols.sleep]),
        at(date, "14:00", "18:00", [], { options: [symbols.play, symbols.bike] }),
      );
      written.push(index === 5
        ? at(date, "10:00", "11:30", [symbols.shop], { people: ["mama", "bente"], showPeople: true })
        : at(date, "10:00", "12:00", [], { options: [symbols.bricks, symbols.book] }));
    }
  }
  await Promise.all(written.map(appointment => database.put("appointments", appointment)));
  await database.put("specials", { id: uuid(), kind: "birthday", person: "mika", from: iso(addDays(monday, 6)), to: iso(addDays(monday, 6)) });
  await Promise.all(["oma", "opa"].map(person =>
    database.put("specials", { id: uuid(), kind: "visit", person, from: iso(addDays(monday, 5)), to: iso(addDays(monday, 6)) })));
}
