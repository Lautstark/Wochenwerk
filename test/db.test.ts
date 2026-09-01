import { beforeEach, describe, expect, it } from "vitest";
import { addDays, iso, type Appointment } from "../src/model.js";
import { allSeries, clearAll, createSeries, dropSeries, editSeries, inSeries, put, reachOf,
  saveSettings, saveVoice, setBirthday, settings, uuid, week } from "../src/db.js";

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
});
