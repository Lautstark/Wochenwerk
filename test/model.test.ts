import { describe, expect, it } from "vitest";
import { addDays, bornOn, birthdayName, dateLabel, dayLabel, iso, seasonOf, lanesOf, occurrences, mondayOf, strays, titleOf, undecided, shownCards,
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

  it("brings 29 February round on the 28th in a year without it, and names the day it brings", () => {
    /* Not 1 March: that is another month and, on the board, another season. */
    expect(occurrences({ kind: "yearly" }, "2028-02-29", "2032-03-01"))
      .toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
    const leapling = { id: "p", name: "Testkind", initials: "TK", tone: "#000", birthday: "2028-02-29", updatedAt: 0 };
    expect(bornOn(leapling, "2029-02-28")).toBe(true);
    expect(bornOn(leapling, "2029-03-01")).toBe(false);
    expect(bornOn(leapling, "2032-02-28")).toBe(false);
    const bar = { id: "b", date: "2029-02-28", symbols: [], options: [], people: ["p"], showPeople: true, updatedAt: 0 };
    expect(birthdayName(bar, [leapling])).toBe("Testkind Geburtstag");
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

describe("the season", () => {
  it("turns on the first of the month, on either side of every boundary", () => {
    /* Each pair straddles one of `seasonMonths`, so the boundaries are what is
       guarded; winter is the one that crosses the new year. */
    expect(seasonOf("2026-02-28")).toBe(3);
    expect(seasonOf("2026-03-01")).toBe(0);
    expect(seasonOf("2026-05-31")).toBe(0);
    expect(seasonOf("2026-06-01")).toBe(1);
    expect(seasonOf("2026-08-31")).toBe(1);
    expect(seasonOf("2026-09-01")).toBe(2);
    expect(seasonOf("2026-11-30")).toBe(2);
    expect(seasonOf("2026-12-01")).toBe(3);
    expect(seasonOf("2027-01-01")).toBe(3);
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

  it("stays one bar where a day differs only in something nothing draws", () => {
    /* A run breaks where a day would be captioned wrongly, and `away` captions
       nothing: it is read by the announcement and never by the board. Two bars
       carrying the same picture and the same name, side by side, would be a
       break the room can see for a difference it cannot. */
    const runs = runsOf([visit(dates[0]), visit(dates[1], { away: true }), visit(dates[2])],
      dates, only(rule(dates[0], dates[2])));
    expect(runs).toHaveLength(1);
    expect(runs[0].days).toEqual(dates.slice(0, 3));
  });

  it("says when a stretch reaches past the days being looked at, and only then", () => {
    const inside = runsOf(dates.slice(1, 3).map(date => visit(date)), dates, only(rule(dates[1], dates[2])));
    expect([inside[0].before, inside[0].after]).toEqual([false, false]);
    const over = runsOf(dates.map(date => visit(date)), dates, only(rule("2026-08-24", "2026-09-20")));
    expect([over[0].before, over[0].after]).toEqual([true, true]);
  });

  it("does not carry a weekly day over the edge to a neighbour the rule does not draw", () => {
    const mondays: Series = { ...rule("2026-08-03", "2026-12-28"), pattern: { kind: "weekly", weekdays: [0] } };
    const sundays: Series = { ...rule("2026-08-02", "2026-12-27"), pattern: { kind: "weekly", weekdays: [6] } };
    const [monday] = runsOf([visit(dates[0])], dates, only(mondays));
    expect([monday.before, monday.after]).toEqual([false, false]);
    const [sunday] = runsOf([visit(dates[6])], dates, only(sundays));
    expect([sunday.before, sunday.after]).toEqual([false, false]);
  });

  it("does not carry a stretch over the edge onto a day deleted from it", () => {
    const gapped: Series = { ...rule("2026-08-24", "2026-09-20"), skipped: ["2026-08-30", "2026-09-07"] };
    const [run] = runsOf(dates.map(date => visit(date)), dates, only(gapped));
    expect([run.before, run.after]).toEqual([false, false]);
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
