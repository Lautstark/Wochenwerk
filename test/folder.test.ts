import { beforeEach, describe, expect, it, vi } from "vitest";

/* The folder itself is sicherung's to test — it has a fake tree and twenty tests
   for it. What is Wochenwerk's to test is the direction: which way records move
   when a folder is connected, and which way they must never move. Getting that
   backwards empties somebody's calendar, which is not hypothetical — it happened,
   and the last test here is that day written down. */

const there = { termine: [] as any[], karten: [] as any[], personen: [] as any[], serien: [] as any[] };
let marked = false, refuse = 0, oldMark = false;

vi.mock("../src/folder.js", () => ({
  KINDS: ["termine", "karten", "personen", "serien"],
  isStore: () => true, isStale: () => false,
  file: async () => {}, unfile: async () => {},
  adopted: async () => marked,
  markedTheOldWay: async () => oldMark,
  dropTheOldMark: async () => { oldMark = false; },
  /* The package's own adopt: write everything, check it landed, then mark — and
     refuse a folder that is already a store. */
  adopt: async (everything: Record<string, any[]>) => {
    if (marked) return { adopted: false, reason: "already", written: 0 };
    let written = 0;
    for (const [kind, records] of Object.entries(everything)) {
      const landed = refuse ? records.slice(0, refuse) : records;
      (there as any)[kind] = landed;
      written += landed.length;
      if (landed.length !== records.length) return { adopted: false, reason: "incomplete", written };
    }
    marked = true;
    return { adopted: true, written };
  },
  /* A folder that stops accepting writes partway is the failure that mattered:
     nothing throws, the records simply are not there afterwards. */
  pushKind: async (kind: keyof typeof there, records: any[]) =>
    { there[kind] = refuse ? records.slice(0, refuse) : records; },
  readKind: async (kind: keyof typeof there) => there[kind],
}));

const { adoptFolder, allCards, clearAll, pullFromFolder, put, settleMark, uuid, week } = await import("../src/db.js");
const { iso } = await import("../src/model.js");

const monday = new Date("2026-08-31T00:00");
const appointment = (title: string) =>
  ({ id: uuid(), date: iso(monday), title, symbols: [], options: [], people: [], showPeople: false, updatedAt: 1 });

beforeEach(async () => {
  marked = false; refuse = 0; oldMark = false;
  for (const kind of Object.keys(there)) (there as any)[kind] = [];
  await clearAll();
});

describe("connecting a folder for the first time", () => {
  it("adopts this browser's calendar when the folder is not a store yet", async () => {
    await put(appointment("Turnen"));
    expect(await adoptFolder()).toBe("pushed");
    expect(there.termine.map(item => item.title)).toEqual(["Turnen"]);
  });

  it("takes the folder's calendar when the folder is already a store", async () => {
    await put(appointment("Turnen"));
    marked = true;
    there.termine = [appointment("Schwimmen")];
    expect(await adoptFolder()).toBe("pulled");
    expect((await week(monday)).map(item => item.title)).toEqual(["Schwimmen"]);
  });
});

describe("a folder that did not finish becoming the store", () => {
  it("is not adopted, and says so rather than reporting success", async () => {
    await put(appointment("Turnen"));
    await put(appointment("Schwimmen"));
    refuse = 1;
    expect(await adoptFolder()).toBe("incomplete");
  });

  it("never becomes the truth, so the browser keeps the whole calendar", async () => {
    await put(appointment("Turnen"));
    await put(appointment("Schwimmen"));
    refuse = 1;
    await adoptFolder();
    await pullFromFolder();
    expect(await week(monday)).toHaveLength(2);
  });
});

describe("reading the folder on start", () => {
  it("replaces rather than merges, so a deletion elsewhere is a deletion here", async () => {
    await put(appointment("Turnen"));
    marked = true;
    await pullFromFolder();
    expect(await week(monday)).toEqual([]);
  });

  it("does not read a folder that carries no calendar of ours", async () => {
    await put(appointment("Turnen"));
    expect(await pullFromFolder()).toBe(false);
    expect(await week(monday)).toHaveLength(1);
  });
});

describe("a folder Wochenwerk marked before the package could", () => {
  it("is handed over once, and keeps being read", async () => {
    there.termine = [appointment("Turnen")];
    oldMark = true;
    await settleMark();
    expect(marked).toBe(true);
    expect(oldMark).toBe(false);
    expect((await week(monday)).map(item => item.title)).toEqual(["Turnen"]);
    expect(there.termine.map(item => item.title)).toEqual(["Turnen"]);
  });

  it("is left alone where the package has already marked it", async () => {
    marked = true; oldMark = true;
    await settleMark();
    expect(oldMark).toBe(true);
  });

  it("reads the folder before handing it back, so a newer folder is not overwritten", async () => {
    /* This browser has not opened since somebody else edited the folder. */
    await put(appointment("Turnen"));
    there.termine = [appointment("Schwimmen")];
    oldMark = true;
    await settleMark();
    expect(there.termine.map(item => item.title)).toEqual(["Schwimmen"]);
    expect((await week(monday)).map(item => item.title)).toEqual(["Schwimmen"]);
  });

  it("keeps its old mark where the handover did not complete", async () => {
    there.termine = [appointment("Turnen"), appointment("Schwimmen")];
    oldMark = true; refuse = 1;
    await settleMark();
    expect(marked).toBe(false);
    expect(oldMark).toBe(true);
  });
});
