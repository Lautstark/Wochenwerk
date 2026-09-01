import { beforeEach, describe, expect, it, vi } from "vitest";

/* The folder itself is sicherung's to test — it has a fake tree and twenty tests
   for it. What is Wochenwerk's to test is the direction: which way records move
   when a folder is connected, and which way they must never move. Getting that
   backwards empties somebody's calendar, so it is pinned here rather than tried
   out on a household. */

const there = { termine: [] as any[], karten: [] as any[], personen: [] as any[], serien: [] as any[] };
const pushed: Record<string, any[]> = {};
let connected = true;

vi.mock("../src/folder.js", () => ({
  KINDS: ["termine", "karten", "personen", "serien"],
  isStore: () => connected,
  isStale: () => false,
  file: async () => {}, unfile: async () => {},
  pushKind: async (kind: string, records: any[]) => { pushed[kind] = records; },
  readKind: async (kind: keyof typeof there) => there[kind],
}));

const { adoptFolder, clearAll, pullFromFolder, put, week, uuid, allCards } = await import("../src/db.js");
const { iso } = await import("../src/model.js");

const monday = new Date("2026-08-31T00:00");
const appointment = (title: string) =>
  ({ id: uuid(), date: iso(monday), title, symbols: [], options: [], people: [], showPeople: false, updatedAt: 1 });

beforeEach(async () => {
  connected = true;
  for (const kind of Object.keys(there)) (there as any)[kind] = [];
  for (const kind of Object.keys(pushed)) delete pushed[kind];
  await clearAll();
});

describe("connecting a folder for the first time", () => {
  it("adopts this browser's calendar when the folder is empty", async () => {
    await put(appointment("Turnen"));
    expect(await adoptFolder()).toBe("pushed");
    expect(pushed.termine.map(item => item.title)).toEqual(["Turnen"]);
  });

  it("takes the folder's calendar when the folder already has one", async () => {
    await put(appointment("Turnen"));
    there.termine = [appointment("Schwimmen")];
    expect(await adoptFolder()).toBe("pulled");
    expect((await week(monday)).map(item => item.title)).toEqual(["Schwimmen"]);
  });

  it("takes the folder's side even when only the cards are there", async () => {
    there.karten = [{ id: uuid(), name: "Malen", updatedAt: 1 }];
    expect(await adoptFolder()).toBe("pulled");
    expect((await allCards()).map(card => card.name)).toEqual(["Malen"]);
  });
});

describe("reading the folder on start", () => {
  it("replaces rather than merges, so a deletion elsewhere is a deletion here", async () => {
    await put(appointment("Turnen"));
    await pullFromFolder();
    expect(await week(monday)).toEqual([]);
  });

  it("leaves this browser alone when no folder is connected", async () => {
    await put(appointment("Turnen"));
    connected = false;
    await pullFromFolder();
    expect(await week(monday)).toHaveLength(1);
  });
});
