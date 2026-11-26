import { describe, expect, it } from "vitest";
import { equal, merge3 } from "../src/merge.js";

/* Two changes to one record, kept both where they can be. ADR 006. */

const base = { id: "a", date: "2026-09-01", start: "09:00", end: "10:00", title: "Turnen", symbols: [], updatedAt: 1 };

describe("merge3", () => {
  it("keeps a change made on one side only", () => {
    const { merged, clashed } = merge3(base, { ...base, start: "10:00", updatedAt: 2 }, base, true);
    expect([merged.start, clashed]).toEqual(["10:00", []]);
  });

  it("keeps two changes to different fields, one from each side", () => {
    const mine = { ...base, start: "10:00", updatedAt: 2 };
    const theirs = { ...base, title: "Schwimmen", updatedAt: 3 };
    const { merged, clashed } = merge3(base, mine, theirs, false);
    expect([merged.start, merged.title, clashed]).toEqual(["10:00", "Schwimmen", []]);
  });

  it("calls one field changed differently on both sides a clash, and the newer side wins it", () => {
    const mine = { ...base, title: "Turnen mit Oma", end: "11:00", updatedAt: 2 };
    const theirs = { ...base, title: "Schwimmen", updatedAt: 3 };
    expect(merge3(base, mine, theirs, false)).toEqual({
      merged: { ...base, title: "Schwimmen", end: "11:00", updatedAt: undefined }, clashed: ["title"],
    });
    expect(merge3(base, mine, theirs, true).merged.title).toBe("Turnen mit Oma");
  });

  it("is no clash where both sides made the same change", () => {
    const same = { ...base, start: "10:00" };
    expect(merge3(base, { ...same, updatedAt: 2 }, { ...same, updatedAt: 3 }, true).clashed).toEqual([]);
  });

  it("goes into a series' shape one field at a time", () => {
    const series = { id: "s", shape: { start: "08:00", end: "12:00", title: "Kita" }, skipped: [], updatedAt: 1 };
    const mine = { ...series, shape: { ...series.shape, end: "13:00" } };
    const theirs = { ...series, shape: { ...series.shape, title: "Kindergarten" } };
    const { merged, clashed } = merge3(series, mine, theirs, true);
    expect([merged.shape, clashed]).toEqual([{ start: "08:00", end: "13:00", title: "Kindergarten" }, []]);
  });

  it("takes out of a series what either side took out, and puts back what either put back", () => {
    const series = { id: "s", skipped: ["2026-09-07"], updatedAt: 1 };
    const mine = { ...series, skipped: ["2026-09-07", "2026-09-14"] };
    const theirs = { ...series, skipped: ["2026-09-16"] };
    const { merged, clashed } = merge3(series, mine, theirs, false);
    expect([merged.skipped, clashed]).toEqual([["2026-09-14", "2026-09-16"], []]);
  });

  it("reads a field added on one side as a change, and one removed as a change", () => {
    const mine = { ...base, speech: "Turnen in der Halle" };
    const { title: _gone, ...theirs } = base;
    const { merged } = merge3(base, mine, theirs as typeof base, true);
    expect([(merged as { speech?: string }).speech, "title" in merged]).toEqual(["Turnen in der Halle", false]);
  });
});

describe("equal", () => {
  it("does not care in which order keys were written", () => {
    expect(equal({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(true);
    expect(equal([1, 2], [2, 1])).toBe(false);
  });
});
