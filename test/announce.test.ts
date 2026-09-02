import { describe, expect, it } from "vitest";
import { announce, couldSay, vocabulary, type Household, type Part } from "../src/announce.js";
import type { Appointment, Card, Person, SymbolRef } from "../src/model.js";

/* 2026-09-01 is a Tuesday, and 09-02 the Wednesday after it. */
const TUESDAY = "2026-09-01";
const at = (time: string, date = TUESDAY) => new Date(`${date}T${time}`);

const kita: SymbolRef = { source: "metacom", id: "Berufe/kindergaertnerin.png", label: "kindergaertnerin" };

const appointment = (start: string | undefined, end: string | undefined, extra: Partial<Appointment> = {}): Appointment =>
  ({ id: `${start}-${extra.title ?? ""}`, date: TUESDAY, start, end, symbols: [kita], options: [], people: [], showPeople: false, updatedAt: 0, ...extra });

const card = (id: string, name: string, speech?: string): Card => ({ id, name, speech, updatedAt: 0 });
const person = (id: string, name: string, birthday?: string): Person =>
  ({ id, name, initials: name.slice(0, 2), tone: "#000", birthday });

const house = (cards: Card[] = [], people: Person[] = []): Household =>
  ({ cards: new Map(cards.map(item => [item.id, item])), people: new Map(people.map(item => [item.id, item])) });

/* The catalogue is about what is said, so the tests read the text. What it is
   played from is checked separately, at the bottom. */
const said = (week: Appointment[], at: Date, home: Household) => announce(week, at, home).map(line => line.text);

describe("the day sentence", () => {
  it("compounds the weekday with the daypart", () => {
    const day = (time: string) => said([], at(time), house())[0];
    expect(day("06:30")).toBe("Es ist Dienstagmorgen.");
    expect(day("08:00")).toBe("Es ist Dienstagmorgen.");
    expect(day("12:00")).toBe("Es ist Dienstagmittag.");
    expect(day("15:30")).toBe("Es ist Dienstagnachmittag.");
    expect(day("19:15")).toBe("Es ist Dienstagabend.");
  });

  it("says a birthday after the day and the daypart, with the age spelled out", () => {
    /* The day sentence starts the same way on every press, a birthday included —
       that shape is the whole of what is learned here. The age is the one number
       a child is told, and it is a word so that the ban on digits still holds. */
    const week = [appointment(undefined, undefined, { symbols: [], people: ["b"] })];
    const lines = said(week, at("09:00"), house([], [person("b", "Mia", "2023-09-01")]));
    expect(lines[0]).toBe("Es ist Dienstagmorgen. Heute ist der Geburtstag von Mia. Mia wird drei Jahre alt.");
  });

  it("leaves the age out rather than guessing at one it has no word for", () => {
    const week = [appointment(undefined, undefined, { symbols: [], people: ["b"] })];
    const lines = said(week, at("09:00"), house([], [person("b", "Oma", "1955-09-01")]));
    expect(lines[0]).toBe("Es ist Dienstagmorgen. Heute ist der Geburtstag von Oma.");
  });

  it("keeps one full stop where a birthday and a day fact fall together", () => {
    /* *Jahre alt.* is recorded with its own, so the sentence after it is not
       given a second one. */
    const week = [appointment(undefined, undefined, { symbols: [], people: ["b"] }),
      appointment(undefined, undefined, { id: "ferien", symbols: [], title: "Ferientag" })];
    const lines = said(week, at("09:00"), house([], [person("b", "Mia", "2023-09-01")]));
    expect(lines[0]).toBe("Es ist Dienstagmorgen. Heute ist der Geburtstag von Mia. Mia wird drei Jahre alt. Heute ist Ferientag.");
  });

  it("gives a named day fact its own sentence rather than a clause on the day", () => {
    /* A day fact arrives as a whole sentence with a subject of its own, so
       "Es ist Donnerstagmorgen, und heute ist Ferientag" would hang two sentences
       off one *und*. Split, the two stand in the same shape and a two-year-old can
       follow the parallel. */
    const week = [appointment(undefined, undefined, { symbols: [], title: "Ferientag" })];
    expect(said(week, at("09:00"), house())[0]).toBe("Es ist Dienstagmorgen. Heute ist Ferientag.");
  });

  it("lets a day say what no frame could have produced", () => {
    /* A day is not always a noun it can *be*. "Heute ist Besuch im Saarland" is
       what bending a trip into that shape sounds like; the household writes the
       sentence instead, and a day fact stands in one frame so nothing else has
       to survive it. */
    const week = [appointment(undefined, undefined, {
      symbols: [], title: "Besuch im Saarland", speech: "Heute fahren wir ins Saarland.",
    })];
    expect(said(week, at("09:00"), house())[0]).toBe("Es ist Dienstagmorgen. Heute fahren wir ins Saarland.");
  });

  it("carries a visit — a person with no symbol on them", () => {
    const week = [appointment(undefined, undefined, { symbols: [], people: ["o"] })];
    const lines = said(week, at("09:00"), house([], [person("o", "Oma")]));
    expect(lines[0]).toBe("Es ist Dienstagmorgen, und Oma kommt.");
  });
});

describe("what is running", () => {
  it("names it", () => {
    const week = [appointment("08:00", "09:00", { title: "Frühstück" })];
    expect(said(week, at("08:30"), house())[1]).toBe("Jetzt ist Frühstück.");
  });

  it("addresses the one person it concerns, and only one", () => {
    const week = [appointment("10:00", "10:45", { title: "Turnen", people: ["b"] })];
    const one = house([], [person("b", "Mia"), person("m", "Toni")]);
    expect(said(week, at("10:10"), one)[1]).toBe("Mia, jetzt ist Turnen.");

    const both = [appointment("10:00", "10:45", { title: "Turnen", people: ["b", "m"] })];
    expect(said(both, at("10:10"), one)[1]).toBe("Jetzt ist Turnen.");
  });

  it("says it is nearly over within one grid step", () => {
    const week = [appointment("08:00", "09:00", { title: "Frühstück" })];
    expect(said(week, at("08:50"), house())[1]).toBe("Frühstück ist gleich fertig.");
  });

  it("says the same thing about an empty moment, whatever comes after it", () => {
    /* It used to add *Du kannst spielen* where the day still had something in
       it, which was the board telling a child what to do with their own time. */
    const week = [appointment("08:00", "09:00", { title: "Frühstück" }), appointment("14:00", "15:00", { title: "Kita" })];
    expect(said(week, at("10:00"), house())[1]).toBe("Gerade ist nichts geplant.");
    expect(said(week, at("19:00"), house())[1]).toBe("Gerade ist nichts geplant.");
  });
});

describe("two at once", () => {
  /* A therapy hour inside a Kita day: the shape that made this worth deciding. */
  const week = () => [appointment("08:45", "14:00", { title: "Kita" }), appointment("11:00", "11:45", { title: "Turnen" })];

  it("announces the inner one, not the bracket around it", () => {
    /* The earlier start used to win, which is nearly always the bracket — so the
       hour inside it was never announced on any press, all year. */
    expect(said(week(), at("11:10"), house())[1]).toBe("Jetzt ist Turnen.");
    expect(said(week(), at("11:40"), house())[1]).toBe("Turnen ist gleich fertig.");
  });

  it("says what resumes when the inner one ends", () => {
    /* Not "Heute ist nichts mehr geplant", which is what it said with three
       hours of Kita still to run. */
    expect(said(week(), at("11:10"), house())[2]).toBe("Danach kommt wieder Kita.");
  });

  it("goes back to the bracket once the inner one is over", () => {
    expect(said(week(), at("12:00"), house())[1]).toBe("Jetzt ist Kita.");
  });

  it("prefers the shorter of two that begin together", () => {
    const both = [appointment("09:00", "12:00", { title: "Kita" }), appointment("09:00", "09:30", { title: "Turnen" })];
    expect(said(both, at("09:10"), house())[1]).toBe("Jetzt ist Turnen.");
  });
});

describe("what comes next", () => {
  /* Breakfast ends at half past and Kita starts at nine, so the wait after the one
     that is running stays inside the horizon and the next thing is worth naming. */
  const week = () => [appointment("08:00", "08:30", { title: "Frühstück" }), appointment("09:00", "12:00", { title: "Kita" })];

  it("is gleich within twenty minutes, danach behind something running, dann in a gap", () => {
    expect(said(week(), at("08:45"), house())[2]).toBe("Gleich kommt Kita.");
    expect(said(week(), at("08:10"), house())[2]).toBe("Danach kommt Kita.");
    expect(said(week(), at("08:35"), house())[2]).toBe("Dann kommt Kita.");
  });

  it("does not name what is hours away, and says the time is free instead", () => {
    /* Kita until two, supper at six. At nine in the morning "danach kommt
       Abendessen" is a word with no time to hang it on. */
    const week = [appointment("08:45", "14:00", { title: "Kita" }), appointment("18:00", "19:00", { title: "Abendessen" })];
    expect(said(week, at("09:00"), house())[2]).toBe("Danach ist nichts geplant.");
  });

  it("measures the wait from the end of what is running, not from now", () => {
    /* The same nine in the morning, but the next thing follows Kita closely. A
       child waits through the gap after Kita, not through Kita. */
    const week = [appointment("08:45", "14:00", { title: "Kita" }), appointment("14:15", "15:00", { title: "Turnen" })];
    expect(said(week, at("09:00"), house())[2]).toBe("Danach kommt Turnen.");
  });

  it("leaves the empty stretch to the now sentence when nothing is running", () => {
    /* Two sentences, not three: *Gerade ist nichts geplant* and *danach ist
       nichts geplant* are one thing said twice. */
    const week = [appointment("08:00", "09:00", { title: "Frühstück" }), appointment("18:00", "19:00", { title: "Abendessen" })];
    expect(said(week, at("10:00"), house())).toEqual(["Es ist Dienstagmorgen.", "Gerade ist nichts geplant."]);
  });

  it("still names a choice that is genuinely next, and says what is in it", () => {
    /* What a choice is worth waiting for is what it is between. Told only that
       there will be a decision, the child has been told about a slot. */
    const week = [appointment("12:00", "13:00", { title: "Mittagessen" }), appointment("13:15", "14:00", { options: ["s"], symbols: [], title: undefined })];
    expect(said(week, at("12:30"), house([card("s", "Schwimmbad")]))[2]).toBe("Danach darfst du aussuchen: Schwimmbad. Was möchtest du tun?");
  });

  it("names the cards in all three frames a choice can be ahead in", () => {
    const cards = house([card("s", "Schwimmbad"), card("p", "Spielplatz")]);
    const choice = appointment("13:15", "14:00", { options: ["s", "p"], symbols: [], title: undefined });
    const behind = [appointment("12:00", "13:00", { title: "Mittagessen" }), choice];
    expect(said(behind, at("13:00"), cards)[2]).toBe("Gleich darfst du aussuchen: Schwimmbad oder Spielplatz. Was möchtest du tun?");
    expect(said(behind, at("12:30"), cards)[2]).toBe("Danach darfst du aussuchen: Schwimmbad oder Spielplatz. Was möchtest du tun?");
    expect(said([choice], at("13:00"), cards)[2]).toBe("Gleich darfst du aussuchen: Schwimmbad oder Spielplatz. Was möchtest du tun?");
    expect(said([choice], at("12:50"), cards)[2]).toBe("Dann darfst du aussuchen: Schwimmbad oder Spielplatz. Was möchtest du tun?");
  });

  it("says only that there is something to choose where the cards cannot all be named", () => {
    /* Four of them, or one without a word: the same rule as when the choice is
       open, and here there is no table in front of the child to point at. */
    const four = house([card("a", "A"), card("b", "B"), card("c", "C"), card("d", "D")]);
    const ahead = (options: string[]) =>
      [appointment("12:00", "13:00", { title: "Mittagessen" }), appointment("13:15", "14:00", { options, symbols: [], title: undefined })];
    expect(said(ahead(["a", "b", "c", "d"]), at("12:30"), four)[2]).toBe("Danach darfst du aussuchen.");
    expect(said(ahead(["a", "b", "gone"]), at("12:30"), four)[2]).toBe("Danach darfst du aussuchen.");
  });

  it("ends at the end of the day and does not reach into the next one", () => {
    /* *Einmal schlafen, dann ist Kita* needed the day emptied out and something
       on the next one — which is bedtime, when a board on a wall is behind
       somebody's back. The day in front of the child is what this is for. */
    const tomorrow = appointment("08:45", "14:00", { title: "Kita", date: "2026-09-02" });
    expect(said([...week(), tomorrow], at("13:00"), house())[2]).toBe("Heute ist nichts mehr geplant.");
    expect(said(week(), at("13:00"), house())[2]).toBe("Heute ist nichts mehr geplant.");
  });
});

describe("a choice", () => {
  const offered = (options: string[], extra: Partial<Appointment> = {}) =>
    [appointment("14:00", "16:00", { title: undefined, symbols: [], options, ...extra })];

  it("is the whole announcement while it is open", () => {
    const cards = [card("s", "Schwimmbad"), card("p", "Spielplatz")];
    expect(said(offered(["s", "p"]), at("14:30"), house(cards)))
      .toEqual(["Jetzt darfst du aussuchen: Schwimmbad oder Spielplatz. Was möchtest du tun?"]);
  });

  it("prefers what a card says of itself over what it is called", () => {
    const cards = [card("s", "Schwimmbad Aquarena", "Schwimmbad"), card("p", "Spielplatz")];
    expect(said(offered(["s", "p"]), at("14:30"), house(cards))[0])
      .toBe("Jetzt darfst du aussuchen: Schwimmbad oder Spielplatz. Was möchtest du tun?");
  });

  it("points at the table rather than naming a part of it", () => {
    /* Four options, and separately three of which one has no name: listing what
       is left would describe a table the child is looking at, wrongly. */
    const four = [card("a", "A"), card("b", "B"), card("c", "C"), card("d", "D")];
    const pointing = "Jetzt darfst du aussuchen. Schau, welche Karten daliegen. Was möchtest du tun?";
    expect(said(offered(["a", "b", "c", "d"]), at("14:30"), house(four))[0]).toBe(pointing);
    expect(said(offered(["a", "b", "gone"]), at("14:30"), house(four))[0]).toBe(pointing);
  });

  it("says one word for a card in every frame it appears in", () => {
    /* Offered and named an hour later are two frames around one noun. A card
       whose spoken word were a phrase would read as *Jetzt ist ins Schwimmbad
       gehen* in the second of them, which is why a record says a word. */
    const cards = [card("s", "Schwimmbad Aquarena", "Schwimmbad")];
    expect(said(offered(["s"]), at("14:30"), house(cards))[0])
      .toBe("Jetzt darfst du aussuchen: Schwimmbad. Was möchtest du tun?");
    expect(said(offered(["s"], { chosen: "s" }), at("14:30"), house(cards))[1])
      .toBe("Jetzt ist Schwimmbad. Das hast du ausgesucht.");
  });

  it("is an ordinary appointment once it is decided, and says who decided it", () => {
    const cards = [card("s", "Schwimmbad"), card("p", "Spielplatz")];
    const decided = offered(["s", "p"], { chosen: "s" });
    expect(said(decided, at("14:30"), house(cards))[1]).toBe("Jetzt ist Schwimmbad. Das hast du ausgesucht.");
    expect(said(decided, at("13:50"), house(cards))[2]).toBe("Gleich kommt Schwimmbad. Das hast du ausgesucht.");
  });

});

describe("what is never said", () => {
  it("says nothing about an appointment nobody named, rather than reading its file name", () => {
    /* The symbol is `kindergaertnerin.png`. It is a serviceable caption under a
       picture and wrong out loud, so an appointment with no name of its own
       contributes no sentence at all. */
    const week = [appointment("08:00", "09:00"), appointment("09:15", "12:00")];
    const lines = said(week, at("08:30"), house());
    expect(lines).toEqual(["Es ist Dienstagmorgen."]);
    expect(lines.join(" ")).not.toContain("kindergaertnerin");
  });

  it("has a vocabulary a person could actually sit down and record", () => {
    /* The number is worth failing on: it is what a household is being asked for
       before the first appointment, and it should not grow by accident. */
    expect(vocabulary()).toHaveLength(new Set(vocabulary()).size);
  });

  it("plays every fixed clip out of the vocabulary a recorder was given", () => {
    /* The household records a word per card, person and appointment when it makes
       one. Everything else has to have been recorded before the first appointment
       was ever planned, so a frame written anywhere but `FRAMES` is a clip nobody
       was asked for — silence on the board, and nothing else to notice it. */
    const known = new Set(vocabulary());
    const week = [
      appointment("07:30", "08:15", { title: "Frühstück" }),
      appointment("08:45", "14:00", { title: "Kita", people: ["b"] }),
      appointment("15:00", "17:00", { title: undefined, symbols: [], options: ["s", "p"] }),
      appointment("18:00", "19:00", { title: "Abendessen", options: ["s"], chosen: "s" }),
      appointment(undefined, undefined, { symbols: [], people: ["b", "o"] }),
      appointment("08:00", "09:00", { title: "Kita", date: "2026-09-02" }),
    ];
    const home = house([card("s", "Schwimmbad"), card("p", "Spielplatz")],
      [person("b", "Mia", "2023-09-01"), person("o", "Oma")]);
    const strangers = new Set<string>();
    for (let minute = 0; minute < 24 * 60; minute++) {
      const moment = new Date(`${TUESDAY}T00:00`);
      moment.setMinutes(minute);
      for (const line of announce(week, moment, home))
        for (const part of line.parts as Part[]) if (!part.own && !known.has(part.say)) strangers.add(part.say);
    }
    expect([...strangers]).toEqual([]);
  });

  it("carries no digit anywhere, at any minute of a full day", () => {
    const week = [
      appointment("07:30", "08:15", { title: "Frühstück" }),
      appointment("08:45", "14:00", { title: "Kita", people: ["b"] }),
      appointment("15:00", "17:00", { title: undefined, symbols: [], options: ["s", "p"] }),
      appointment("18:00", "19:00", { title: "Abendessen" }),
      appointment(undefined, undefined, { symbols: [], people: ["o"] }),
    ];
    const home = house([card("s", "Schwimmbad"), card("p", "Spielplatz")], [person("b", "Mia"), person("o", "Oma")]);
    for (let minute = 0; minute < 24 * 60; minute++) {
      const moment = new Date(`${TUESDAY}T00:00`);
      moment.setMinutes(minute);
      const spoken = said(week, moment, home).join(" ");
      expect(spoken, `at ${moment.toTimeString().slice(0, 5)}`).not.toMatch(/\d/);
      expect(spoken.length, `at ${moment.toTimeString().slice(0, 5)}`).toBeLessThan(180);
    }
  });
});

describe("the word that is said", () => {
  it("prefers the Ansage over the title, which only stands in for it", () => {
    /* The board draws symbols and never a title, so a title is free to carry
       what the child is not told — a room, a practice, a surname. `speech` is
       what is said instead, and it wins wherever it is set. */
    const week = [appointment("08:00", "09:00", { title: "Frühförderung, SPZ Raum 3", speech: "Spielstunde" })];
    expect(said(week, at("08:30"), house())[1]).toBe("Jetzt ist Spielstunde.");
    expect(couldSay("Spielstunde")[0]!.text).toBe("Jetzt ist Spielstunde.");
  });

  it("falls back to the title where no Ansage was written", () => {
    const week = [appointment("08:00", "09:00", { title: "Turnen" })];
    expect(said(week, at("08:30"), house())[1]).toBe("Jetzt ist Turnen.");
  });
});

describe("what a word can turn up in", () => {
  it("says nothing at all without a word", () => {
    /* The list is shown while a name is being typed, and a frame with a hole in
       it answers nothing — so there is no list until there is something to put
       in it. */
    expect(couldSay("")).toEqual([]);
    expect(couldSay("   ")).toEqual([]);
  });

  it("is built from the frames the board actually speaks from", () => {
    const said = couldSay("Turnen").map(line => line.text);
    expect(said).toContain("Jetzt ist Turnen.");
    expect(said).toContain("Gleich kommt Turnen.");
    /* Every line is about the word. "Heute kommt nichts mehr" is not — it
       belongs to no appointment and is prepared with the voice, not with this. */
    expect(said.every(line => line.includes("Turnen"))).toBe(true);
    expect(said).toHaveLength(5);
  });

  it("addresses the one person it concerns", () => {
    const said = couldSay("Turnen", { who: "Mia" }).map(line => line.text);
    expect(said).toContain("Mia, jetzt ist Turnen.");
    expect(said).toContain("Mia, Turnen ist gleich fertig.");
  });

  it("names the cards while a choice is open, and says nothing about itself", () => {
    /* "Jetzt darfst du aussuchen: Nachmittagszeit" is the word the parents filed
       it under; the child is being offered a Laufrad and a Spielplatz. And until
       something picks one, there is no appointment to announce. */
    const said = couldSay("Nachmittagszeit", { offering: ["Laufrad fahren", "Spielplatz"] }).map(line => line.text);
    expect(said[0]).toBe("Jetzt darfst du aussuchen: Laufrad fahren oder Spielplatz. Was möchtest du tun?");
    /* And ahead of it the cards are named too, and asked about in the same words. */
    expect(said).toContain("Danach darfst du aussuchen: Laufrad fahren oder Spielplatz. Was möchtest du tun?");
    expect(said.some(line => line.includes("Nachmittagszeit"))).toBe(false);
    expect(said).toHaveLength(4);
  });

  it("says what was picked, not what the parents filed it under", () => {
    /* The title on a choice is a parent's word for the slot. The child was
       offered a Laufrad and a Spielplatz and never that. */
    const cards = [card("s", "Spielplatz")];
    const week = [appointment("08:00", "09:00", { title: "Nachmittagszeit", options: ["s"], chosen: "s", symbols: [] })];
    expect(said(week, at("08:30"), house(cards))[1]).toBe("Jetzt ist Spielplatz. Das hast du ausgesucht.");
  });

  it("says nothing of its own even before the cards are added", () => {
    /* A choice with no cards yet is still a choice: a name typed into it would
       never be said, so the field must not offer one. Keyed on the count rather
       than on being a choice at all, this fell back to the six word sentences —
       "Jetzt ist Nachmittagszeit" — which is the word the parents filed it under. */
    const said = couldSay("Nachmittagszeit", { offering: [] }).map(line => line.text);
    expect(said.some(line => line.includes("Nachmittagszeit"))).toBe(false);
    expect(said).toHaveLength(4);
  });

  it("is about what was picked, once something picked", () => {
    const said = couldSay("Spielplatz", { picked: true }).map(line => line.text);
    expect(said).toContain("Jetzt ist Spielplatz. Das hast du ausgesucht.");
    expect(said).toContain("Spielplatz ist gleich fertig.");
  });

  it("gives a birthday the day sentence too, once per daypart", () => {
    const said = couldSay("", { birthday: { names: ["Mia"], age: 3 }, date: "2026-09-03" });
    expect(said.map(line => line.text)).toEqual([
      "Es ist Donnerstagmorgen. Heute ist der Geburtstag von Mia. Mia wird drei Jahre alt.",
      "Es ist Donnerstagmittag. Heute ist der Geburtstag von Mia. Mia wird drei Jahre alt.",
      "Es ist Donnerstagnachmittag. Heute ist der Geburtstag von Mia. Mia wird drei Jahre alt.",
      "Es ist Donnerstagabend. Heute ist der Geburtstag von Mia. Mia wird drei Jahre alt.",
    ]);
  });

  it("gives an all-day appointment the day sentence, once per daypart", () => {
    /* It is never running and never next: it is a fact about the day, and the
       day sentence is the only one that carries it. That sentence names the day
       it is said on and compounds the daypart onto it, so there are four — and
       the weekday is the appointment's own, not a specimen. */
    const said = couldSay("Heute ist Ferientag.", { allDay: true, date: "2026-09-03" });
    expect(said.map(line => line.text)).toEqual([
      "Es ist Donnerstagmorgen. Heute ist Ferientag.",
      "Es ist Donnerstagmittag. Heute ist Ferientag.",
      "Es ist Donnerstagnachmittag. Heute ist Ferientag.",
      "Es ist Donnerstagabend. Heute ist Ferientag.",
    ]);
  });

  it("says nothing about a day it was not told the date of", () => {
    expect(couldSay("Heute ist Ferientag.", { allDay: true })).toEqual([]);
  });
});
