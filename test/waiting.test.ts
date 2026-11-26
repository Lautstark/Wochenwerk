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
/* Held shut to keep a sync running for as long as a test needs it to. */
let reading: Promise<void> = Promise.resolve();
/* And one for writes: held shut, a delivery stands in the middle of its write. */
let writing: Promise<void> = Promise.resolve();
/* Titles the folder will not take, for a write that fails on its own. */
const refused = new Set<string>();

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
  file: async (kind: Kind, record: Record_) => {
    await writing;
    if (away || refused.has(record.title ?? "")) return false;
    put_(kind, record);
    return true;
  },
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
  readKind: async (kind: Kind) => { await reading; return there[kind]; },
  readOne: async (kind: Kind, id: string) => (away ? null : there[kind].find(item => item.id === id) ?? null),
  reconnect: async () => undefined,
}));

const { adoptFolder, carriedOver, clearAll, createSeries, delivered, onMet, exportAll, importAll, onChanged, onSyncing, owed, owing, pullFromFolder,
  put: saved, remove: removed, settleUp, uuid, week } = await import("../src/db.js");

/* A save returns once the browser has it and delivers to the folder afterwards
   (ADR 005). These cases are about what the folder is owed once that delivery has
   been tried, so they wait for it; the cases at the end are about the delivery. */
const put = async (...args: Parameters<typeof saved>) => { await saved(...args); await delivered(); };
const remove = async (...args: Parameters<typeof removed>) => { await removed(...args); await delivered(); };
const { iso } = await import("../src/model.js");

const monday = new Date("2026-08-31T00:00");
const appointment = (title: string, updatedAt = 1) =>
  ({ id: uuid(), date: iso(monday), title, symbols: [], options: [], people: [], showPeople: false, updatedAt });

beforeEach(async () => {
  away = false;
  writing = Promise.resolve();
  refused.clear();
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
    /* Both changed the title, so it is a clash and said as one (ADR 006) — but
       ours was typed later, so ours is the one that stands. */
    const { clashed } = await settleUp();
    expect(clashed).toHaveLength(1);
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

describe("connecting a folder that is already a store", () => {
  /* The day this cost a household two cards. The folder is the truth and a `pull`
     replaces — which is right once the two share a history, and a deletion before
     they do. Everything here is simply a record the folder has not been told
     about, and it goes over before anything is read back. */
  it("carries what only this browser has into the folder instead of deleting it", async () => {
    const mine = appointment("Pfannkuchen");
    await put(mine);
    /* A folder that never heard of it: the household's real one, chosen for the
       first time from a browser that had been planning on its own. */
    there.termine = [];
    expect(await adoptFolder()).toBe("pulled");
    expect(there.termine.map(item => item.title)).toEqual(["Pfannkuchen"]);
    expect((await week(monday)).map(item => item.title)).toEqual(["Pfannkuchen"]);
    expect(carriedOver()).toBe(1);
  });

  it("leaves a record the folder already knows to the folder", async () => {
    const one = appointment("Waffeln backen");
    await put(one);
    there.termine = [{ ...one, title: "Pfannkuchen", updatedAt: Date.now() + 60_000 }];
    await adoptFolder();
    expect((await week(monday)).map(item => item.title)).toEqual(["Pfannkuchen"]);
    expect(carriedOver()).toBe(0);
  });

  it("says the number once and not twice", async () => {
    await put(appointment("Pfannkuchen"));
    there.termine = [];
    await adoptFolder();
    expect(carriedOver()).toBe(1);
    expect(carriedOver()).toBe(0);
  });
});

describe("the bulk writes", () => {
  it("each say that something changed, so the standing backup is scheduled", async () => {
    await put(appointment("Waffeln backen"));
    const backup = await exportAll();
    const heard = vi.fn();
    const stop = onChanged(heard);
    try {
      await importAll(backup);
      expect(heard).toHaveBeenCalled();
      heard.mockClear();
      await clearAll();
      expect(heard).toHaveBeenCalled();
    } finally { stop(); }
  });
});

/* The mirror is drawn before the folder is read, so somebody can press something
   while the read is under way. `pull` empties the stores and fills them again; a
   write between the two halves used to be a write the second half deleted. ADR 004. */
describe("a write while the folder is being read", () => {
  it("waits for the read and is not wiped by it", async () => {
    let open!: () => void;
    reading = new Promise(resolve => { open = resolve; });
    const pulling = pullFromFolder();
    const saving = put(appointment("Waffeln backen"));
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(there.termine).toEqual([]);
    open();
    await Promise.all([pulling, saving]);
    reading = Promise.resolve();
    expect((await week(monday)).map(item => item.title)).toEqual(["Waffeln backen"]);
    expect(there.termine.map(item => item.title)).toEqual(["Waffeln backen"]);
  });

  it("says when the read starts and when it ends", async () => {
    const heard: boolean[] = [];
    const stop = onSyncing(busy => heard.push(busy));
    await pullFromFolder();
    stop();
    expect(heard).toEqual([true, false]);
  });
});

/* A save is done when the browser has it; the folder is delivered to afterwards,
   and owed it until then. ADR 005. */
describe("delivering to the folder after the save", () => {
  const held = () => { let open!: () => void; writing = new Promise(resolve => { open = resolve; }); return open; };

  it("returns before the folder has it, and owes it until it does", async () => {
    const open = held();
    await saved(appointment("Waffeln backen"));
    expect((await week(monday)).map(item => item.title)).toEqual(["Waffeln backen"]);
    expect([there.termine.length, await owed()]).toEqual([0, 1]);
    open();
    await delivered();
    expect(there.termine.map(item => item.title)).toEqual(["Waffeln backen"]);
    expect(await owed()).toBe(0);
  });

  it("delivers the last of three quick edits, and a deletion as a deletion", async () => {
    const one = appointment("Waffeln");
    for (const title of ["Waffeln", "Waffeln backen", "Waffeln backen mit Oma"]) await saved({ ...one, title });
    await delivered();
    expect(there.termine.map(item => item.title)).toEqual(["Waffeln backen mit Oma"]);
    await saved({ ...one, title: "Pfannkuchen" });
    await removed(one.id);
    await delivered();
    expect([there.termine, await owed()]).toEqual([[], 0]);
  });

  it("is not paid off by a delivery that was under way when it was made", async () => {
    const one = appointment("Waffeln backen");
    const open = held();
    await saved(one);
    await new Promise(resolve => setTimeout(resolve, 5));
    /* The first delivery has read the record and stands in its write. The edit
       made now is one the folder will refuse, so only its row says it is owed. */
    refused.add("Pfannkuchen");
    await saved({ ...one, title: "Pfannkuchen" });
    open();
    await delivered();
    expect(there.termine.map(item => item.title)).toEqual(["Waffeln backen"]);
    expect((await owing()).map(row => row.record)).toEqual([one.id]);
    refused.clear();
    await settleUp();
    expect([there.termine.map(item => item.title), await owed()]).toEqual([["Pfannkuchen"], 0]);
  });

  it("keeps owing a delivery that did not land", async () => {
    away = true;
    await saved(appointment("Waffeln backen"));
    await delivered();
    expect(await owed()).toBe(1);
  });
});

/* Two changes to one record, made on two devices before either saw the other's.
   The folder is the other device; `put_` is it saving. ADR 006. */
describe("two changes to one record", () => {
  const theirs = (record: Record_ & Record<string, unknown>) => put_("termine", { ...record, updatedAt: Date.now() + 60_000 });
  const heard = () => { const met: { what?: string; name: string }[] = []; const stop = onMet(item => met.push(item)); return { met, stop }; };

  it("keeps both where they changed different things", async () => {
    const one = appointment("Turnen");
    await put(one);
    const [stored] = await week(monday);
    theirs({ ...stored, title: "Schwimmen" });
    await put({ ...stored, speech: "Heute ist Turnen in der Halle." });
    const [folder] = there.termine as (Record_ & { speech?: string })[];
    expect([folder.title, folder.speech]).toEqual(["Schwimmen", "Heute ist Turnen in der Halle."]);
    const [here] = await week(monday);
    expect([here.title, here.speech]).toEqual(["Schwimmen", "Heute ist Turnen in der Halle."]);
    expect(await owed()).toBe(0);
  });

  it("says so where both changed the same thing, and the later one stands", async () => {
    const { met, stop } = heard();
    await put(appointment("Turnen"));
    const [stored] = await week(monday);
    theirs({ ...stored, title: "Schwimmen" });
    await put({ ...stored, title: "Turnen mit Oma" });
    stop();
    expect(there.termine.map(item => item.title)).toEqual(["Schwimmen"]);
    expect(met).toEqual([expect.objectContaining({ what: "both", name: "Schwimmen" })]);
  });

  it("keeps a change made there over a deletion made here, and says so", async () => {
    const { met, stop } = heard();
    const one = appointment("Turnen");
    await put(one);
    const [stored] = await week(monday);
    theirs({ ...stored, title: "Schwimmen" });
    await remove(one.id);
    stop();
    expect((await week(monday)).map(item => item.title)).toEqual(["Schwimmen"]);
    expect(met.map(item => item.what)).toEqual(["kept"]);
  });

  it("brings back what was deleted there when it was changed here", async () => {
    const one = appointment("Turnen");
    await put(one);
    const [stored] = await week(monday);
    there.termine = [];
    await put({ ...stored, title: "Turnen mit Oma" });
    expect(there.termine.map(item => item.title)).toEqual(["Turnen mit Oma"]);
  });

  it("merges a save from a sheet that was open while the newer version came in", async () => {
    const one = appointment("Turnen");
    await put(one);
    /* The sheet opened on this version… */
    const [opened] = await week(monday);
    /* …the other device saved, and the poll brought it here… */
    theirs({ ...opened, title: "Schwimmen" });
    await pullFromFolder();
    expect((await week(monday)).map(item => item.title)).toEqual(["Schwimmen"]);
    /* …and the sheet is saved with only its own change in it. */
    await put({ ...opened, speech: "Heute ist Turnen in der Halle." });
    const [here] = await week(monday);
    expect([here.title, here.speech]).toEqual(["Schwimmen", "Heute ist Turnen in der Halle."]);
  });
});

describe("two devices taking days out of one series", () => {
  it("takes out both, rather than the second putting the first back", async () => {
    const id = await createSeries({ kind: "weekly", weekdays: [0, 2] }, iso(monday), iso(new Date("2026-09-30T00:00")),
      { symbols: [], options: [], people: [], showPeople: false, title: "Kita" } as never);
    await delivered();
    const [rule] = there.serien as (Record_ & { skipped: string[] })[];
    /* The other device takes Wednesday out… */
    put_("serien", { ...rule, skipped: ["2026-09-02"], updatedAt: Date.now() + 60_000 } as Record_);
    /* …and this one Monday, before it has seen that. */
    await removed(`${id}@2026-08-31`);
    await delivered();
    const [merged] = there.serien as (Record_ & { skipped: string[] })[];
    expect(merged.skipped).toEqual(["2026-08-31", "2026-09-02"]);
  });
});
