import { describe, expect, it } from "vitest";
import { addDays, iso, lanesOf, occurrences, mondayOf, titleOf, undecided, shownCards,
  type Appointment, type Card } from "../src/model.js";

const at = (start: string, end: string, extra: Partial<Appointment> = {}): Appointment =>
  ({ id: start, date: "2026-09-01", start, end, symbols: [], options: [], people: [], showPeople: false, updatedAt: 0, ...extra });

describe("occurrences", () => {
  it("walks weekdays between the bounds", () => {
    const dates = occurrences({ kind: "weekly", weekdays: [0, 2] }, "2026-08-31", "2026-09-13");
    expect(dates).toEqual(["2026-08-31", "2026-09-02", "2026-09-07", "2026-09-09"]);
  });

  it("steps a yearly pattern by years, not by days", () => {
    /* The guard on the daily walk is 4000 iterations, which is eleven years — a
       birthday a century out has to step differently or it stops in 2037. */
    const dates = occurrences({ kind: "yearly" }, "2026-09-06", "2126-09-06");
    expect(dates).toHaveLength(101);
    expect(dates.at(-1)).toBe("2126-09-06");
  });

  it("covers every day of a span", () => {
    expect(occurrences({ kind: "daily" }, "2026-09-05", "2026-09-07")).toHaveLength(3);
  });

  it("gives nothing back when the bounds are inverted", () => {
    expect(occurrences({ kind: "daily" }, "2026-09-07", "2026-09-05")).toEqual([]);
  });
});

describe("lanesOf", () => {
  it("leaves an appointment alone when nothing runs beside it", () => {
    const [only] = lanesOf([at("09:00", "10:00")]);
    expect(only.lanes).toBe(1);
  });

  it("splits the width between two that overlap", () => {
    const laid = lanesOf([at("08:45", "14:00"), at("11:00", "11:45")]);
    expect(laid.map(item => item.lanes)).toEqual([2, 2]);
    expect(laid.map(item => item.lane)).toEqual([0, 1]);
  });

  it("reuses a lane once the appointment in it has ended", () => {
    const laid = lanesOf([at("08:00", "12:00"), at("09:00", "09:30"), at("10:00", "10:30")]);
    expect(laid.every(item => item.lanes === 2)).toBe(true);
    expect(laid[1].lane).toBe(1);
    expect(laid[2].lane).toBe(1);
  });

  it("keeps two clusters apart", () => {
    const laid = lanesOf([at("08:00", "09:00"), at("08:30", "09:00"), at("12:00", "13:00")]);
    expect(laid.at(-1)!.lanes).toBe(1);
  });
});

describe("what an appointment is called", () => {
  const cards = new Map<string, Card>([["a", { id: "a", name: "Spielplatz", updatedAt: 0 }]]);

  it("prefers a name of its own", () => {
    expect(titleOf(at("09:00", "10:00", { title: "Elternabend" }), cards)).toBe("Elternabend");
  });

  it("falls back to what it shows", () => {
    const one = at("09:00", "10:00", { symbols: [{ source: "metacom", id: "x.png", label: "Kita" }] });
    expect(titleOf(one, cards)).toBe("Kita");
  });

  it("names an undecided appointment after what may be picked", () => {
    const choice = at("14:00", "18:00", { options: ["a"] });
    expect(undecided(choice)).toBe(true);
    expect(titleOf(choice, cards)).toBe("Spielplatz");
  });

  it("shows only what was picked once an input has picked it", () => {
    const settled = at("14:00", "18:00", { options: ["a", "b"], chosen: "a" });
    expect(undecided(settled)).toBe(false);
    expect(shownCards(settled)).toEqual(["a"]);
  });
});

describe("dates", () => {
  it("finds the Monday of a week that starts in the previous month", () => {
    expect(iso(mondayOf(new Date("2026-09-02T12:00")))).toBe("2026-08-31");
  });

  it("keeps Sunday in the week that began on Monday", () => {
    expect(iso(mondayOf(new Date("2026-09-06T12:00")))).toBe("2026-08-31");
  });

  it("crosses a month boundary when adding days", () => {
    expect(iso(addDays(new Date("2026-08-31T12:00"), 6))).toBe("2026-09-06");
  });
});
