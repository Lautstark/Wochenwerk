import { beforeEach, describe, expect, it, vi } from "vitest";

/* What the folder is owed while it cannot be reached, and what happens on the way
   back. This is the day written down: the share on the wall device was not mounted,
   a week was planned on the laptop anyway, and every one of those edits went into
   IndexedDB and nowhere else. Nothing said so, nothing remembered it, and the next
   read of the folder — which is the truth — deleted the lot.

   A folder that can go away is the whole of what this file mocks, which is why it
   is not in folder.test.ts: that one's folder is always there on purpose. */

type Record_ = { id: string; updatedAt: number; title?: string };
const there = { termine: [] as Record_[], karten: [] as Record_[], personen: [] as Record_[], serien: [] as Record_[] };
type Kind = keyof typeof there;
let away = false;

const put_ = (kind: Kind, record: Record_) => {
  const at = there[kind].findIndex(item => item.id === record.id);
  if (at < 0) there[kind].push({ ...record }); else there[kind][at] = { ...record };
};

vi.mock("../src/folder.js", () => ({
  KINDS: ["termine", "karten", "personen", "serien"],
  isStore: () => true,
  isStale: () => away,
  adopted: async () => !away,
  adopt: async () => ({ adopted: true, written: 0 }),
  file: async (kind: Kind, record: Record_) => { if (away) return false; put_(kind, record); return true; },
  unfile: async (kind: Kind, id: string) => {
    if (away) return false;
    there[kind] = there[kind].filter(item => item.id !== id);
    return true;
  },
  pushKind: async (kind: Kind, records: Record_[]) => {
    if (away) return false;
    there[kind] = records.map(record => ({ ...record }));
    return true;
  },
  stamps: async (kind: Kind) => new Map(there[kind].map(item => [item.id, item.updatedAt])),
  readKind: async (kind: Kind) => there[kind],
  reconnect: async () => undefined,
}));

const { clearAll, owed, owing, pullFromFolder, put, remove, settleUp, uuid, week } = await import("../src/db.js");
const { iso } = await import("../src/model.js");

const monday = new Date("2026-08-31T00:00");
const appointment = (title: string, updatedAt = 1) =>
  ({ id: uuid(), date: iso(monday), title, symbols: [], options: [], people: [], showPeople: false, updatedAt });

beforeEach(async () => {
  away = false;
  for (const kind of Object.keys(there) as Kind[]) there[kind] = [];
  await clearAll();
  /* Emptying the calendar is itself something the folder is owed, and a test that
     starts with a row already in the queue is counting the last test's. */
  await settleUp();
});

describe("planning while the folder is out of reach", () => {
  it("keeps the edit and remembers that the folder has not been told", async () => {
    away = true;
    await put(appointment("Waffeln backen"));
    expect((await week(monday)).map(item => item.title)).toEqual(["Waffeln backen"]);
    expect(await owed()).toBe(1);
    expect(there.termine).toEqual([]);
  });

  it("owes one row for a record edited over and over", async () => {
    away = true;
    const one = appointment("Waffeln backen");
    for (const title of ["Waffeln", "Waffeln backen", "Waffeln backen mit Oma"]) await put({ ...one, title });
    expect(await owed()).toBe(1);
  });

  it("writes it the moment the folder is back, without anybody asking", async () => {
    away = true;
    await put(appointment("Waffeln backen"));
    away = false;
    const { sent, clashed } = await settleUp();
    expect([sent, clashed]).toEqual([1, []]);
    expect(there.termine.map(item => item.title)).toEqual(["Waffeln backen"]);
    expect(await owed()).toBe(0);
  });

  it("carries a deletion across as a deletion", async () => {
    const one = appointment("Waffeln backen");
    await put(one);
    away = true;
    await remove(one.id);
    away = false;
    await settleUp();
    expect(there.termine).toEqual([]);
  });

  /* The one that cost a week. `pull` empties these stores and fills them from the
     folder, so anything not yet written there is about to be deleted — and the
     folder coming back is exactly when `pull` runs. */
  it("is not wiped by the read that follows the folder coming back", async () => {
    away = true;
    await put(appointment("Waffeln backen"));
    away = false;
    await pullFromFolder();
    expect((await week(monday)).map(item => item.title)).toEqual(["Waffeln backen"]);
  });

  it("owes nothing while the folder is there", async () => {
    await put(appointment("Waffeln backen"));
    expect(await owed()).toBe(0);
    expect(there.termine.map(item => item.title)).toEqual(["Waffeln backen"]);
  });
});

describe("when the same record was changed on both sides", () => {
  it("leaves the newer one alone and hands back the clash", async () => {
    const one = appointment("Waffeln backen", 10);
    await put(one);
    away = true;
    await put({ ...one, title: "Waffeln backen mit Oma" });
    /* Somebody at the other machine planned the same day afterwards. `put` stamps
       with the clock, so *afterwards* is a moment past this one. */
    put_("termine", { ...one, title: "Pfannkuchen", updatedAt: Date.now() + 60_000 });
    away = false;
    const { sent, clashed } = await settleUp();
    expect([sent, clashed.length]).toEqual([0, 1]);
    expect(there.termine.map(item => item.title)).toEqual(["Pfannkuchen"]);
  });

  it("writes ours where it is the newer one", async () => {
    const one = appointment("Waffeln backen", 10);
    await put(one);
    away = true;
    await put({ ...one, title: "Waffeln backen mit Oma" });
    /* Their edit is the older one: ours was typed after it. */
    put_("termine", { ...one, title: "Pfannkuchen", updatedAt: 30 });
    away = false;
    const { clashed } = await settleUp();
    expect(clashed).toEqual([]);
    expect(there.termine.map(item => item.title)).toEqual(["Waffeln backen mit Oma"]);
  });

  /* A clash is reported once and the row goes: the folder is the truth, the `pull`
     after this brings their version in, and a row that re-clashed on every pass
     would leave the banner standing over a calendar with nothing left to send. */
  it("does not keep owing a clash it has already reported", async () => {
    const one = appointment("Waffeln backen", 10);
    await put(one);
    away = true;
    await put({ ...one, title: "Waffeln backen mit Oma" });
    put_("termine", { ...one, title: "Pfannkuchen", updatedAt: Date.now() + 60_000 });
    away = false;
    await settleUp();
    expect(await owed()).toBe(0);
    expect((await settleUp()).clashed).toEqual([]);
  });
});

describe("a folder that goes away again mid-settle", () => {
  it("stops rather than running to the end, and still owes the rest", async () => {
    away = true;
    await put(appointment("Waffeln backen"));
    await put(appointment("Turnen"));
    expect(await owed()).toBe(2);
    const { sent } = await settleUp();
    expect([sent, await owed()]).toEqual([0, 2]);
    expect((await owing()).every(row => row.kind === "termine")).toBe(true);
  });
});
