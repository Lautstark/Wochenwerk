import { beforeEach, describe, expect, it } from "vitest";
import { addDays, iso, type Appointment } from "../src/model.js";
import { allCards, allPeople, allSeries, awayAhead, clearAll, createSeries, exportAll, importAll, isBackup, putCard, putPerson, saveAzure, dropSeries, editSeries, inSeries, put, reachOf, remove, repattern,
  reshapeOf, saveSettings, saveVoice, seriesFrom, setBirthday, settings, uuid, week } from "../src/db.js";

const monday = new Date("2026-08-31T00:00");
const shape = (start?: string, end?: string): Omit<Appointment, "id" | "date" | "series" | "updatedAt"> =>
  ({ start, end, symbols: [], options: [], people: [], showPeople: false });

beforeEach(async () => { await clearAll(); });

describe("a week", () => {
  it("is a range over the date index, and stops at its bounds", async () => {
    await createSeries({ kind: "daily" }, iso(monday), iso(addDays(monday, 9)), shape("09:00", "10:00"));
    expect(await week(monday)).toHaveLength(7);
  });
});

describe("a series", () => {
  it("comes back in the order it runs, not in key order", async () => {
    const id = await createSeries({ kind: "yearly" }, "2026-09-06", "2036-09-06", shape());
    const dates = (await inSeries(id)).map(item => item.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("writes one appointment per occurrence and remembers how", async () => {
    const id = await createSeries({ kind: "weekly", weekdays: [0, 2] }, iso(monday), iso(addDays(monday, 13)), shape("09:00", "10:00"));
    expect(await inSeries(id)).toHaveLength(4);
    expect((await allSeries())[0].pattern).toEqual({ kind: "weekly", weekdays: [0, 2] });
  });

  it("reaches only from a date when asked to", async () => {
    const id = await createSeries({ kind: "daily" }, iso(monday), iso(addDays(monday, 6)), shape("09:00", "10:00"));
    expect(await reachOf(id)).toHaveLength(7);
    expect(await reachOf(id, iso(addDays(monday, 4)))).toHaveLength(3);
  });

  it("changes only what a reach covers, and leaves the rest alone", async () => {
    const id = await createSeries({ kind: "daily" }, iso(monday), iso(addDays(monday, 6)), shape("09:00", "10:00"));
    const changed = await editSeries(id, { end: "11:30" }, iso(addDays(monday, 4)));
    expect(changed).toBe(3);
    const after = await week(monday);
    expect(after.filter(item => item.end === "11:30")).toHaveLength(3);
    expect(after.filter(item => item.end === "10:00")).toHaveLength(4);
  });

  it("keeps its own record while part of it survives, and drops it when none does", async () => {
    const id = await createSeries({ kind: "daily" }, iso(monday), iso(addDays(monday, 6)), shape("09:00", "10:00"));
    await dropSeries(id, iso(addDays(monday, 4)));
    expect(await allSeries()).toHaveLength(1);
    await dropSeries(id);
    expect(await allSeries()).toHaveLength(0);
  });

  it("leaves an appointment edited on its own out of nothing else", async () => {
    const id = await createSeries({ kind: "daily" }, iso(monday), iso(addDays(monday, 2)), shape("09:00", "10:00"));
    const [first] = await inSeries(id);
    await put({ ...first, title: "anders" });
    expect((await inSeries(id)).filter(item => item.title === "anders")).toHaveLength(1);
  });
});

describe("an appointment turned into a series", () => {
  const single = (date: string, extra: Partial<Appointment> = {}): Appointment =>
    ({ id: uuid(), date, start: "09:00", end: "10:00", symbols: [], options: [], people: [], showPeople: false, updatedAt: 0, ...extra });

  it("keeps the record it came from, and writes the rest around it", async () => {
    const one = single(iso(monday), { title: "Kita" });
    await put(one);
    const id = await seriesFrom(one, { kind: "weekly", weekdays: [0, 2] }, iso(addDays(monday, 13)));
    const batch = await inSeries(id);
    expect(batch).toHaveLength(4);
    expect(batch[0].id).toBe(one.id);
    expect(batch.every(item => item.title === "Kita")).toBe(true);
    expect((await allSeries())[0].from).toBe(iso(monday));
  });

  it("leaves a choice resolved where it was resolved, and the copies undecided", async () => {
    const one = single(iso(monday), { options: ["a", "b"], chosen: "a" });
    await put(one);
    const batch = await inSeries(await seriesFrom(one, { kind: "daily" }, iso(addDays(monday, 2))));
    expect(batch.map(item => item.chosen)).toEqual(["a", undefined, undefined]);
  });

  it("does not stay behind when the pattern skips its own day", async () => {
    const tuesday = iso(addDays(monday, 1));
    const one = single(tuesday);
    await put(one);
    const id = await seriesFrom(one, { kind: "weekly", weekdays: [0, 2] }, iso(addDays(monday, 6)));
    const batch = await inSeries(id);
    expect(batch.map(item => item.date)).toEqual([iso(addDays(monday, 2))]);
    expect((await week(monday)).some(item => item.id === one.id)).toBe(false);
  });

  it("cannot be given an end before it starts", async () => {
    const one = single(iso(addDays(monday, 3)));
    await put(one);
    const id = await seriesFrom(one, { kind: "daily" }, iso(monday));
    expect((await inSeries(id)).map(item => item.date)).toEqual([one.date]);
  });
});

describe("a choice inside a batch", () => {
  const offering = (): Omit<Appointment, "id" | "date" | "series" | "updatedAt"> =>
    ({ symbols: [], options: ["a", "b"], people: [], showPeople: false });
  const resolved = async () => {
    const id = await createSeries({ kind: "daily" }, iso(monday), iso(addDays(monday, 2)), offering());
    const [first] = await inSeries(id);
    await put({ ...first, chosen: "a" });
    return id;
  };

  it("stays on the day it was made on when the batch is changed around it", async () => {
    const id = await resolved();
    await editSeries(id, { title: "neu" });
    const after = await inSeries(id);
    expect(after.map(item => item.chosen)).toEqual(["a", undefined, undefined]);
    expect(after.every(item => item.title === "neu")).toBe(true);
  });

  it("goes when the card it picked is no longer offered", async () => {
    const id = await resolved();
    await editSeries(id, { options: ["b", "c"] });
    expect((await inSeries(id)).map(item => item.chosen)).toEqual([undefined, undefined, undefined]);
  });
});

describe("a batch given a new rule", () => {
  const fortnight = () => createSeries({ kind: "daily" }, iso(monday), iso(addDays(monday, 13)), shape("09:00", "10:00"));

  it("cuts the batch in two rather than reaching back past where the new rule starts", async () => {
    const id = await fortnight();
    const before = (await inSeries(id)).slice(0, 7).map(item => item.id);
    const change = await repattern(id, { kind: "weekly", weekdays: [0, 2] }, iso(addDays(monday, 7)), iso(addDays(monday, 13)));
    expect(change.dropping).toHaveLength(5);
    expect(change.adding).toHaveLength(0);
    /* What lay before the cut is untouched, down to the days it covers. */
    expect((await inSeries(id)).map(item => item.id)).toEqual(before);
    expect(change.series).not.toBe(id);
    expect(await inSeries(change.series)).toHaveLength(2);
  });

  it("leaves a day that survives exactly as it was", async () => {
    const id = await createSeries({ kind: "daily" }, iso(monday), iso(addDays(monday, 6)), shape("09:00", "10:00"));
    const wednesday = (await inSeries(id))[2];
    await put({ ...wednesday, title: "eigen" });
    await repattern(id, { kind: "weekly", weekdays: [0, 2] }, iso(monday), iso(addDays(monday, 6)));
    const after = await inSeries(id);
    expect(after).toHaveLength(2);
    /* Editing a day is what turns it into a record, so it has an id of its own
       from that moment — the derived handle it had before was never one. */
    expect(after[1]).toMatchObject({ date: wednesday.date, title: "eigen" });
  });

  it("gives the days a widened rule adds the batch's shape, and leaves an edited day its own", async () => {
    const id = await createSeries({ kind: "weekly", weekdays: [0] }, iso(monday), iso(addDays(monday, 13)), shape("09:00", "10:00"));
    const [first] = await inSeries(id);
    await put({ ...first, title: "eigen" });
    await repattern(id, { kind: "weekly", weekdays: [0, 2] }, iso(monday), iso(addDays(monday, 13)));
    expect((await inSeries(id)).map(item => item.title)).toEqual(["eigen", undefined, undefined, undefined]);
  });

  it("moves where the rule starts, so the old part is a batch of its own", async () => {
    const id = await fortnight();
    const change = await repattern(id, { kind: "weekly", weekdays: [0, 2] }, iso(addDays(monday, 7)), iso(addDays(monday, 13)));
    const batches = Object.fromEntries((await allSeries()).map(item => [item.id, item]));
    expect(batches[id].until).toBe(iso(addDays(monday, 6)));
    expect(batches[change.series].from).toBe(iso(addDays(monday, 7)));
    expect(await inSeries(id)).toHaveLength(7);
  });

  it("says what it would cost without costing it", async () => {
    const id = await createSeries({ kind: "daily" }, iso(monday), iso(addDays(monday, 6)), shape("09:00", "10:00"));
    const change = await reshapeOf(id, { kind: "weekly", weekdays: [0, 2] }, iso(monday), iso(addDays(monday, 6)));
    expect(change.dropping).toHaveLength(5);
    expect(await inSeries(id)).toHaveLength(7);
  });
});

describe("a whole-day appointment", () => {
  it("has no time, and a multi-day one is a day each", async () => {
    const id = await createSeries({ kind: "daily" }, "2026-09-05", "2026-09-06", shape());
    const made = await inSeries(id);
    expect(made).toHaveLength(2);
    expect(made.every(item => !item.start)).toBe(true);
  });
});

describe("a birthday", () => {
  it("writes a century of days from a date on the person, and replaces them when it moves", async () => {
    const person = { id: uuid(), name: "Testperson", initials: "TP", tone: "#000" };
    await setBirthday(person, "2026-09-06");
    const [series] = await allSeries();
    expect(await inSeries(series.id)).toHaveLength(101);

    const carrying = { ...person, birthday: "2026-09-06", birthdaySeries: series.id };
    await setBirthday(carrying, "2026-09-07");
    const [moved] = await allSeries();
    expect(await allSeries()).toHaveLength(1);
    expect(moved.id).not.toBe(series.id);
    /* The old batch is gone rather than added to, so nothing is left on the 6th. */
    expect((await week(monday)).filter(item => item.date === "2026-09-06")).toHaveLength(0);
    const dates = (await inSeries(moved.id)).map(item => item.date);
    expect(dates[0]).toBe("2026-09-07");
    expect(dates).toHaveLength(101);
  });

  it("takes the appointments with it when the date is cleared", async () => {
    const person = { id: uuid(), name: "Testperson", initials: "TP", tone: "#000" };
    await setBirthday(person, "2026-09-06");
    const [series] = await allSeries();
    await setBirthday({ ...person, birthday: "2026-09-06", birthdaySeries: series.id }, undefined);
    expect(await allSeries()).toHaveLength(0);
    expect(await week(monday)).toHaveLength(0);
  });
});

describe("the settings record", () => {
  /* The file-wide reset is clearAll(), which leaves settings alone on purpose —
     so this describe resets its own record. Without it these tests would only
     pass in the order they happen to be written in, and the first one to be
     added above them would break the rest. */
  beforeEach(async () => { await saveSettings({ azure: undefined, voice: undefined, metacomRendering: undefined }); });

  it("is one record: a second preference does not overwrite the first", async () => {
    /* Nothing set is an empty answer, not a missing one: every caller reads it
       the same way on a first run as on any other. */
    expect(await settings()).toEqual({});
    await saveSettings({ azure: { key: "k", region: "westeurope" } });
    await saveVoice("piper:de_DE-thorsten-medium");
    expect(await settings()).toEqual({
      azure: { key: "k", region: "westeurope" }, voice: "piper:de_DE-thorsten-medium",
    });
  });

  /* Clearing the calendar is about what the household planned. What it set up —
     the voice, the key — is not data it wrote, and losing it on "start again" is
     how somebody ends up with a silent board and no idea why. */
  it("survives the calendar being emptied", async () => {
    await saveVoice("piper:de_DE-thorsten-medium");
    await clearAll();
    expect((await settings()).voice).toBe("piper:de_DE-thorsten-medium");
  });

  /* Three panels write three halves of one record, so the merge is the thing worth
     asserting: the rendering is written by the Symbole panel and must not arrive
     as a replacement for what the other two put there. */
  it("takes a third preference without disturbing the first two", async () => {
    await saveSettings({ azure: { key: "k", region: "westeurope" } });
    await saveVoice("piper:de_DE-thorsten-medium");
    await saveSettings({ metacomRendering: "PNG_ohne_Rahmen" });
    expect(await settings()).toEqual({
      azure: { key: "k", region: "westeurope" },
      voice: "piper:de_DE-thorsten-medium",
      metacomRendering: "PNG_ohne_Rahmen",
    });
    /* Cleared back to no preference, which is absent rather than a value meaning
       "none" — the state a household that never answered is already in. */
    await saveSettings({ metacomRendering: undefined });
    expect((await settings()).metacomRendering).toBeUndefined();
  });
});

/* The change that made a folder a workable store: a rule is a record, not the
   thousands of days it implies. What has to keep working is the two ways a day
   stops following its rule. */
describe("a batch that is a rule rather than its days", () => {
  const decade = () => createSeries({ kind: "daily" }, "2026-08-31", "2036-08-31", shape("18:00", "19:00"));

  it("is one record however many days it covers", async () => {
    const id = await decade();
    expect(await allSeries()).toHaveLength(1);
    expect(await inSeries(id)).toHaveLength(3654);
    expect(await week(monday)).toHaveLength(7);
  });

  it("stores nothing for a day nobody touched", async () => {
    await decade();
    expect(await inSeries((await allSeries())[0].id)).not.toHaveLength(0);
    expect((await week(monday)).every(item => item.id.includes("@"))).toBe(true);
  });

  it("makes a day concrete when it is edited, and leaves the rest derived", async () => {
    const id = await decade();
    const tuesday = (await week(monday))[1];
    await put({ ...tuesday, title: "Besuch" });
    const days = await week(monday);
    expect(days.filter(item => item.title === "Besuch")).toHaveLength(1);
    expect(days).toHaveLength(7);
    expect(await inSeries(id)).toHaveLength(3654);
  });

  it("takes a deleted day out of the rule, so it does not come back", async () => {
    const id = await decade();
    await remove((await week(monday))[1].id);
    expect(await week(monday)).toHaveLength(6);
    expect((await allSeries())[0].skipped).toEqual(["2026-09-01"]);
    expect(await inSeries(id)).toHaveLength(3653);
  });

  it("puts a birthday on the birthday, whatever week it is read through", async () => {
    /* A yearly rule takes its month and day from where it began. Reading it
       through a window must not move it to the edge of that window. */
    const id = await createSeries({ kind: "yearly" }, "2023-10-08", "2123-10-08",
      { symbols: [], options: [], people: [], showPeople: false });
    expect(await week(monday)).toEqual([]);
    expect((await week(new Date("2026-10-05T00:00"))).map(item => item.date)).toEqual(["2026-10-08"]);
    expect((await inSeries(id)).slice(0, 2).map(item => item.date)).toEqual(["2023-10-08", "2024-10-08"]);
  });

  it("keeps a day deleted after it had been edited, rather than letting the rule redraw it", async () => {
    await decade();
    const tuesday = (await week(monday))[1];
    await put({ ...tuesday, title: "Besuch" });
    await remove((await week(monday)).find(item => item.title === "Besuch")!.id);
    expect(await week(monday)).toHaveLength(6);
  });
});

/* A snapshot in a file: the thing that survives a mistake a live folder would
   carry everywhere within seconds. */
describe("a backup", () => {
  const fill = async () => {
    await createSeries({ kind: "daily" }, iso(monday), iso(addDays(monday, 6)), shape("18:00", "19:00"));
    await putCard({ id: uuid(), name: "Malen", updatedAt: 1 });
    await putPerson({ id: uuid(), name: "Kind", initials: "KI", tone: "#4f8fd6", updatedAt: 1 });
  };

  it("carries the rules and what they are about, and comes back whole", async () => {
    await fill();
    const backup = await exportAll();
    await clearAll();
    expect(await allSeries()).toHaveLength(0);
    expect(await importAll(backup)).toBeGreaterThan(0);
    expect(await allSeries()).toHaveLength(1);
    expect(await week(monday)).toHaveLength(7);
    expect((await allCards())[0].name).toBe("Malen");
    expect((await allPeople())[0].name).toBe("Kind");
  });

  it("leaves this device's setup out, because a key is not part of a calendar", async () => {
    await saveAzure({ key: "geheim", region: "westeurope" });
    const backup = await exportAll();
    expect(JSON.stringify(backup)).not.toContain("geheim");
  });

  it("adds and never overwrites, so reading one into a calendar in use is safe", async () => {
    await fill();
    const backup = await exportAll();
    const before = (await allSeries())[0];
    await editSeries(before.id, { title: "Abendbrot" });
    expect(await importAll(backup)).toBe(0);
    expect((await allSeries())[0].shape.title).toBe("Abendbrot");
  });

  it("refuses a file that is not one of ours rather than reading half of it", () => {
    expect(isBackup({ termine: [] })).toBe(false);
    expect(isBackup(null)).toBe(false);
  });
});

describe("the next day away from home", () => {
  /* What the announcement asks the store: not what happens, only whether we will
     be here. The window is the announcement's rule and is handed in. */
  const inSevenDays = (from: Date) => awayAhead(iso(addDays(from, 1)), iso(addDays(from, 7)));
  const trip = { ...shape(), away: true };

  it("finds a day a rule put there, and gives the first of the stretch", async () => {
    await createSeries({ kind: "daily" }, iso(addDays(monday, 4)), iso(addDays(monday, 6)), trip);
    expect(await inSevenDays(monday)).toBe(iso(addDays(monday, 4)));
  });

  it("looks past nothing else that is planned", async () => {
    await createSeries({ kind: "daily" }, iso(monday), iso(addDays(monday, 6)), shape("09:00", "10:00"));
    expect(await inSevenDays(monday)).toBeUndefined();
  });

  it("stops at the window rather than at the week", async () => {
    /* The day it is about is usually not on the board at all — that is the whole
       reason the question exists — but a trip a fortnight off is not *bald*. */
    await put({ ...trip, id: uuid(), date: iso(addDays(monday, 9)), updatedAt: 0 } as Appointment);
    expect(await inSevenDays(monday)).toBeUndefined();
    expect(await awayAhead(iso(addDays(monday, 1)), iso(addDays(monday, 14)))).toBe(iso(addDays(monday, 9)));
  });

  it("says nothing about today, whatever today is", async () => {
    await put({ ...trip, id: uuid(), date: iso(monday), updatedAt: 0 } as Appointment);
    expect(await inSevenDays(monday)).toBeUndefined();
  });

  it("forgets a day that was taken out of the rule", async () => {
    const id = await createSeries({ kind: "daily" }, iso(addDays(monday, 3)), iso(addDays(monday, 4)), trip);
    const days = await inSeries(id);
    await remove(days[0]!.id);
    expect(await inSevenDays(monday)).toBe(iso(addDays(monday, 4)));
  });
});
