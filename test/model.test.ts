import { describe, expect, it } from "vitest";
import { addDays, dateLabel, dayLabel, iso, lanesOf, occurrences, mondayOf, strays, titleOf, undecided, shownCards,
  type Appointment, type Card , runsOf, type Series } from "../src/model.js";

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

describe("an appointment with something of its own", () => {
  it("is one that differs from what it is held against", () => {
    expect(strays(at("09:00", "10:00"), at("09:00", "10:00"))).toBe(false);
    expect(strays(at("09:00", "10:00", { title: "eigen" }), at("09:00", "10:00"))).toBe(true);
    expect(strays(at("09:00", "11:00"), at("09:00", "10:00"))).toBe(true);
  });

  it("counts a choice already made, because that is the day's own answer", () => {
    const offered = { options: ["a", "b"] };
    expect(strays(at("09:00", "10:00", { ...offered, chosen: "a" }), at("09:00", "10:00", offered))).toBe(true);
  });
});

describe("dates", () => {
  it("finds the Monday of a week that starts in the previous month", () => {
    expect(iso(mondayOf(new Date("2026-09-02T12:00")))).toBe("2026-08-31");
  });

  it("keeps Sunday in the week that began on Monday", () => {
    expect(iso(mondayOf(new Date("2026-09-06T12:00")))).toBe("2026-08-31");
  });

  it("carries the year where a date stands on its own", () => {
    expect(dayLabel("2036-10-25")).toBe("25.10.");
    expect(dateLabel("2036-10-25")).toBe("25.10.2036");
  });

  it("crosses a month boundary when adding days", () => {
    expect(iso(addDays(new Date("2026-08-31T12:00"), 6))).toBe("2026-09-06");
  });
});

describe("a stretch of all-day appointments", () => {
  const dates = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"];
  const day = (date: string, extra: Partial<Appointment> = {}): Appointment =>
    ({ id: `x-${date}-${extra.series ?? ""}`, date, symbols: [], options: [], people: [], showPeople: false, updatedAt: 0, ...extra });
  const visit = (date: string, extra: Partial<Appointment> = {}) => day(date, { series: "s1", title: "Oma da", ...extra });
  const rule = (from: string, until: string): Series =>
    ({ id: "s1", pattern: { kind: "daily" }, from, until, shape: { symbols: [], options: [], people: [], showPeople: false },
       skipped: [], allDay: true, createdAt: 0, updatedAt: 0 });
  const only = (item: Series) => new Map([[item.id, item]]);

  it("makes one run of consecutive days that say the same thing", () => {
    const runs = runsOf(dates.slice(0, 3).map(date => visit(date)), dates, only(rule(dates[0], dates[2])));
    expect(runs).toHaveLength(1);
    expect(runs[0].days).toEqual(dates.slice(0, 3));
  });

  it("does not bridge a gap, because the days between are not planned", () => {
    const runs = runsOf([visit(dates[0]), visit(dates[3])], dates, only(rule(dates[0], dates[3])));
    expect(runs.map(run => run.days)).toEqual([[dates[0]], [dates[3]]]);
  });

  it("breaks where a day was edited, so no bar is captioned with the wrong name", () => {
    const runs = runsOf([visit(dates[0]), visit(dates[1], { title: "Oma fährt" }), visit(dates[2])],
      dates, only(rule(dates[0], dates[2])));
    expect(runs.map(run => run.appointment.title)).toEqual(["Oma da", "Oma fährt", "Oma da"]);
  });

  it("says when a stretch reaches past the days being looked at, and only then", () => {
    const inside = runsOf(dates.slice(1, 3).map(date => visit(date)), dates, only(rule(dates[1], dates[2])));
    expect([inside[0].before, inside[0].after]).toEqual([false, false]);
    const over = runsOf(dates.map(date => visit(date)), dates, only(rule("2026-08-24", "2026-09-20")));
    expect([over[0].before, over[0].after]).toEqual([true, true]);
  });

  it("puts stretches that overlap in lanes of their own", () => {
    const runs = runsOf([
      ...dates.slice(0, 3).map(date => visit(date)),
      day(dates[1], { series: "s2", title: "Ferien" }),
    ], dates, only(rule(dates[0], dates[2])));
    expect(runs.map(run => run.lane)).toEqual([0, 1]);
    expect(runs[0].lanes).toBe(2);
  });

  it("leaves an appointment with no series a stretch of one day", () => {
    const runs = runsOf([day(dates[2], { title: "Ferientag" })], dates, new Map());
    expect(runs[0].days).toEqual([dates[2]]);
    expect([runs[0].before, runs[0].after]).toEqual([false, false]);
  });
});
