import { expect, test, type Locator, type Page } from "@playwright/test";
import { at, openCalendar, person, stubSpeech, timed, WEEK } from "./seed.js";

/*
 * The calendar, as a person uses it.
 *
 * These are the behaviour half of the contract the rebuild has to keep — the
 * pixel half is visual.spec.ts, and the two ask different questions. A
 * screenshot says whether a panel still looks the same; nothing in it says
 * whether an appointment still lands on Thursday. So every assertion here is
 * something a parent does and sees: a button by its name, a field by its
 * label, an appointment by its title and where it stands in the week. No class
 * name is load-bearing in this file, because the markup is what the rebuild
 * changes and the behaviour is what it may not.
 *
 * Every test starts from an empty browser and a pinned clock — Tuesday
 * 2026-09-01, 09:30 — so „this week" is always 31.8. – 6.9. and today is
 * always the Tuesday. Where a test needs records before it starts, they are
 * seeded into the database rather than clicked together, so a test of
 * renaming is not also a test of adding.
 */

test.beforeEach(async ({ page }) => { await at(page, "09:30"); });

/* ## The appointment sheet, by its words */

/** Opens „＋ Termin" and hands back the sheet. Named after the draft, so
    `page.getByRole("dialog")` alone would go stale the moment a title is typed. */
async function newAppointment(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "＋ Termin" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Picks a symbol out of the search — the one thing a timed appointment cannot be saved without. */
async function pickSymbol(sheet: Locator, word: string): Promise<void> {
  await sheet.getByRole("button", { name: "＋ Symbol" }).click();
  await sheet.getByLabel("Symbol suchen").fill(word);
  await sheet.getByRole("button", { name: word, exact: true }).click();
}

/** The name field stands where the heading would: it is the sheet's title, and
    it reads „Name" until something is typed. Found by that name rather than by
    placeholder, because the Ansage field below shows the same word as the one
    it would say instead. */
const titleOf = (sheet: Locator, name = "Name") => sheet.getByRole("textbox", { name, exact: true });

/** „＋ Termin" opens an all-day draft; a time is asked for by unticking Ganztägig. */
async function withTimes(sheet: Locator, from: string, to: string): Promise<void> {
  await sheet.getByLabel("Ganztägig").uncheck();
  await sheet.getByLabel("Von", { exact: true }).fill(from);
  /* Three fields are labelled „Bis" — the end of the time, the end of a
     stretch, the end of a rule — and the sheet shows exactly one of them at a
     time. */
  await sheet.getByLabel(/^Bis/).filter({ visible: true }).fill(to);
}

/** Fills the sheet the way a person does: name, day, times, picture, Fertig. */
async function plan(page: Page, { title, date, from, to }: { title: string; date: string; from: string; to: string }): Promise<void> {
  const sheet = await newAppointment(page);
  await titleOf(sheet).fill(title);
  await sheet.getByLabel("Tag", { exact: true }).fill(date);
  await withTimes(sheet, from, to);
  await pickSymbol(sheet, title);
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(sheet).toBeHidden();
}

/** An appointment in the week, by its name. In the week and not in a sheet
    over it, where a picked symbol is a button of the same name. */
const week = (page: Page) => page.getByRole("main");
const inWeek = (page: Page, title: string) => week(page).getByRole("button", { name: title, exact: true });

/** The head of a day's column: the cell carrying the weekday's two letters. */
const dayHead = (page: Page, weekday: string) => week(page).getByText(weekday, { exact: true }).locator("..");

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  expect(found, "the element has a box on screen").not.toBeNull();
  return found!;
}

test("an empty calendar says so and offers the way in", async ({ page }) => {
  await openCalendar(page);
  await expect(page.getByText("Noch nichts geplant")).toBeVisible();
  await expect(page.getByText("Leg den ersten Termin an — oder klick in eine Spalte.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Einstellungen", exact: true })).toBeVisible();
});

test("a new appointment lands in the column of its day", async ({ page }) => {
  await openCalendar(page);
  await plan(page, { title: "Turnen", date: WEEK[3], from: "10:00", to: "11:00" });
  const turnen = inWeek(page, "Turnen");
  await expect(turnen).toBeVisible();
  await expect(page.getByText("Noch nichts geplant")).toBeHidden();
  /* Thursday's column is the one under Thursday's head, and nowhere else. */
  const event = await box(turnen), thursday = await box(dayHead(page, "DO")), tuesday = await box(dayHead(page, "DI"));
  expect(event.x).toBeGreaterThanOrEqual(thursday.x - 1);
  expect(event.x + event.width).toBeLessThanOrEqual(thursday.x + thursday.width + 1);
  expect(event.x).toBeGreaterThanOrEqual(tuesday.x + tuesday.width);
});

test("height carries duration, and an hour later stands an hour lower", async ({ page }) => {
  await openCalendar(page);
  await plan(page, { title: "Turnen", date: WEEK[3], from: "10:00", to: "11:00" });
  await plan(page, { title: "Logopädie", date: WEEK[3], from: "13:00", to: "15:00" });
  const one = await box(inWeek(page, "Turnen")), two = await box(inWeek(page, "Logopädie"));
  /* Two hours is twice one hour, and 13:00 is three hours under 10:00. The
     couple of pixels are the gap the grid keeps between neighbours. */
  expect(two.height / one.height).toBeGreaterThan(1.85);
  expect(two.height / one.height).toBeLessThan(2.15);
  const hour = one.height + 2;
  expect(Math.abs((two.y - one.y) - 3 * hour)).toBeLessThan(4);
});

test("the sheet says how long it lasts while the times are typed", async ({ page }) => {
  await openCalendar(page);
  const sheet = await newAppointment(page);
  await withTimes(sheet, "10:00", "11:30");
  await expect(sheet.getByText("1½ Std")).toBeVisible();
  await sheet.getByLabel(/^Bis/).filter({ visible: true }).fill("10:45");
  await expect(sheet.getByText("45 Min")).toBeVisible();
});

test("without a picture the sheet refuses to save, and says why", async ({ page }) => {
  await openCalendar(page);
  const sheet = await newAppointment(page);
  await titleOf(sheet).fill("Turnen");
  await withTimes(sheet, "10:00", "11:00");
  await expect(sheet.getByRole("button", { name: "Fertig" })).toBeDisabled();
  await expect(sheet.getByText("Such ein Symbol aus, sonst bleibt die Karte am Board leer.")).toBeVisible();
  await pickSymbol(sheet, "Turnen");
  await expect(sheet.getByRole("button", { name: "Fertig" })).toBeEnabled();
});

test("editing changes what the week shows", async ({ page }) => {
  await openCalendar(page, { appointments: [timed(WEEK[3], "10:00", "11:00", "Turnen")] });
  await inWeek(page, "Turnen").click();
  const sheet = page.getByRole("dialog", { name: "Turnen" });
  await expect(titleOf(sheet, "Turnen")).toHaveValue("Turnen");
  await titleOf(sheet, "Turnen").fill("Judo");
  /* The sheet is named after what is in it, so it is „Judo" from here on. */
  const renamed = page.getByRole("dialog", { name: "Judo" });
  await renamed.getByLabel("Von", { exact: true }).fill("16:00");
  await renamed.getByLabel(/^Bis/).filter({ visible: true }).fill("17:00");
  await renamed.getByRole("button", { name: "Fertig" }).click();
  await expect(inWeek(page, "Turnen")).toHaveCount(0);
  await expect(inWeek(page, "Judo")).toBeVisible();
  /* Moved down the day as well as renamed: 16:00 is under 10:00. */
  await expect(inWeek(page, "Judo")).toHaveAttribute("title", "Judo · 16:00–17:00");
});

test("deleting asks first — Abbrechen keeps it, Löschen removes it", async ({ page }) => {
  await openCalendar(page, { appointments: [timed(WEEK[3], "10:00", "11:00", "Turnen")] });
  await inWeek(page, "Turnen").click();
  const sheet = page.getByRole("dialog", { name: "Turnen" });
  await sheet.getByRole("button", { name: "Löschen" }).click();
  const asking = page.getByRole("dialog", { name: "Termin löschen" });
  await expect(asking.getByText("„Turnen“ am 3.9. wird gelöscht.")).toBeVisible();
  await asking.getByRole("button", { name: "Abbrechen" }).click();
  await expect(asking).toBeHidden();
  await expect(sheet).toBeVisible();
  await expect(inWeek(page, "Turnen")).toBeVisible();

  await sheet.getByRole("button", { name: "Löschen" }).click();
  await page.getByRole("dialog", { name: "Termin löschen" }).getByRole("button", { name: "Löschen" }).click();
  await expect(sheet).toBeHidden();
  await expect(inWeek(page, "Turnen")).toHaveCount(0);
  await expect(page.getByText("Noch nichts geplant")).toBeVisible();
});

test("an all-day appointment stands in the ganztags row rather than in the column", async ({ page }) => {
  await openCalendar(page);
  const sheet = await newAppointment(page);
  await titleOf(sheet).fill("Ferientag");
  await sheet.getByLabel("Tag", { exact: true }).fill(WEEK[4]);
  /* A new appointment is all day until it is given a time. */
  await expect(sheet.getByLabel("Ganztägig")).toBeChecked();
  await expect(sheet.getByLabel("Von", { exact: true })).toBeHidden();
  await pickSymbol(sheet, "Ferientag");
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(sheet).toBeHidden();
  const bar = inWeek(page, "Ferientag");
  await expect(bar).toBeVisible();
  /* Above the hours: the bar's bottom edge is above the first hour of the day. */
  const seven = await box(week(page).getByText("07:00", { exact: true }));
  expect((await box(bar)).y + (await box(bar)).height).toBeLessThanOrEqual(seven.y + 1);
});

test("the week can be walked forwards and back, and Heute returns", async ({ page }) => {
  await openCalendar(page);
  const label = page.getByText("31.8. – 6.9. 2026");
  await expect(label).toBeVisible();
  await page.getByRole("button", { name: "›" }).click();
  await expect(page.getByText("7.9. – 13.9. 2026")).toBeVisible();
  await page.getByRole("button", { name: "‹" }).click();
  await page.getByRole("button", { name: "‹" }).click();
  await expect(page.getByText("24.8. – 30.8. 2026")).toBeVisible();
  await page.getByRole("button", { name: "Heute" }).click();
  await expect(label).toBeVisible();
});

test("today is marked in the head of the week, and only this week", async ({ page }) => {
  await openCalendar(page);
  const dateOf = (weekday: string) => dayHead(page, weekday).locator("span");
  await expect(dateOf("DI")).toHaveText("1");
  /* Today's number is drawn on a disc; a neighbour's stands bare. The rebuild
     may draw the disc however it likes, as long as the two do not look alike. */
  const marked = (weekday: string) => dateOf(weekday).evaluate(node => getComputedStyle(node).backgroundColor);
  expect(await marked("DI")).not.toBe(await marked("MI"));
  expect(await marked("MO")).toBe(await marked("MI"));
  await page.getByRole("button", { name: "›" }).click();
  await expect(dateOf("DI")).toHaveText("8");
  expect(await marked("DI")).toBe(await marked("MI"));
});

test("a weekly appointment repeats into the following weeks", async ({ page }) => {
  await openCalendar(page);
  const sheet = await newAppointment(page);
  await titleOf(sheet).fill("Kindergarten");
  await withTimes(sheet, "08:00", "12:00");
  await sheet.getByLabel("Wiederholen").selectOption("wöchentlich");
  await pickSymbol(sheet, "Kindergarten");
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(inWeek(page, "Kindergarten")).toHaveCount(1);
  await page.getByRole("button", { name: "›" }).click();
  await expect(page.getByText("7.9. – 13.9. 2026")).toBeVisible();
  await expect(inWeek(page, "Kindergarten")).toHaveCount(1);
  await page.getByRole("button", { name: "›" }).click();
  await expect(inWeek(page, "Kindergarten")).toHaveCount(1);
});

test("deleting one day of a series asks how far, and „nur diesen“ reaches one day", async ({ page }) => {
  await openCalendar(page);
  const sheet = await newAppointment(page);
  await titleOf(sheet).fill("Kindergarten");
  await withTimes(sheet, "08:00", "12:00");
  await sheet.getByLabel("Wiederholen").selectOption("wöchentlich");
  await pickSymbol(sheet, "Kindergarten");
  await sheet.getByRole("button", { name: "Fertig" }).click();

  await inWeek(page, "Kindergarten").click();
  await page.getByRole("dialog", { name: "Kindergarten" }).getByRole("button", { name: "Löschen" }).click();
  const asking = page.getByRole("dialog", { name: "Wiederkehrender Termin löschen" });
  await expect(asking.getByRole("radio", { name: "Nur diesen Termin" })).toBeChecked();
  await expect(asking.getByRole("button", { name: "1 Termin löschen" })).toBeVisible();
  /* The other answer counts what it would take, before it takes it. */
  await asking.getByRole("radio", { name: /Alle Termine der Serie/ }).check();
  await expect(asking.getByRole("button", { name: /\d+ Termine löschen/ })).toBeVisible();
  await asking.getByRole("radio", { name: "Nur diesen Termin" }).check();
  await asking.getByRole("button", { name: "1 Termin löschen" }).click();

  await expect(inWeek(page, "Kindergarten")).toHaveCount(0);
  await page.getByRole("button", { name: "›" }).click();
  await expect(inWeek(page, "Kindergarten")).toHaveCount(1);
});

test("what was planned is still there after a reload", async ({ page }) => {
  await openCalendar(page);
  await plan(page, { title: "Turnen", date: WEEK[3], from: "10:00", to: "11:00" });
  await page.reload();
  await expect(inWeek(page, "Turnen")).toBeVisible();
  await expect(inWeek(page, "Turnen")).toHaveAttribute("title", "Turnen · 10:00–11:00");
});

/* ## The settings sheet */

async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Wird geladen …")).toHaveCount(0);
  return sheet;
}

/** One of the folding panels, found by its heading, and unfolded. */
async function panel(sheet: Locator, heading: string): Promise<Locator> {
  const node = sheet.locator("details").filter({ has: sheet.page().getByText(heading, { exact: true }) });
  await node.locator("summary").click();
  await expect(node).toHaveJSProperty("open", true);
  return node;
}

/** What a panel's heading says beside its name, without unfolding it. */
const headingOf = (sheet: Locator, heading: string) =>
  sheet.locator("summary").filter({ has: sheet.page().getByText(heading, { exact: true }) });

test("a person can be added, and the panel counts her", async ({ page }) => {
  await openCalendar(page);
  const sheet = await openSettings(page);
  await expect(headingOf(sheet, "Personen")).toContainText("0 Personen");
  const people = await panel(sheet, "Personen");
  await expect(people.getByText("noch niemand")).toBeVisible();
  await people.getByRole("button", { name: "＋ Neue Person" }).click();
  await people.getByLabel("Name").fill("Oma");
  await people.getByRole("button", { name: "Fertig" }).click();
  await expect(people.getByText("Oma", { exact: true })).toBeVisible();
  await expect(people.getByText("kein Geburtstag")).toBeVisible();
  await expect(headingOf(sheet, "Personen")).toContainText("1 Person");
});

test("a person can be renamed from her row", async ({ page }) => {
  await openCalendar(page, { people: [person("Oma")] });
  const sheet = await openSettings(page);
  const people = await panel(sheet, "Personen");
  await people.getByRole("button", { name: "Mehr" }).click();
  await page.getByRole("menuitem", { name: "Bearbeiten" }).click();
  await expect(people.getByLabel("Name")).toHaveValue("Oma");
  await people.getByLabel("Name").fill("Omi");
  await people.getByRole("button", { name: "Fertig" }).click();
  await expect(people.getByText("Omi", { exact: true })).toBeVisible();
  await expect(people.getByText("Oma", { exact: true })).toHaveCount(0);
});

test("removing a person asks first", async ({ page }) => {
  await openCalendar(page, { people: [person("Oma")] });
  const sheet = await openSettings(page);
  const people = await panel(sheet, "Personen");
  await people.getByRole("button", { name: "Mehr" }).click();
  await page.getByRole("menuitem", { name: "Entfernen" }).click();
  const asking = page.getByRole("dialog", { name: "Person entfernen" });
  await expect(asking.getByText("Oma wird entfernt. Termine bleiben, verlieren aber diese Person.")).toBeVisible();
  await asking.getByRole("button", { name: "Entfernen" }).click();
  await expect(people.getByText("noch niemand")).toBeVisible();
  await expect(headingOf(sheet, "Personen")).toContainText("0 Personen");
});

test("a card is made with a name, a picture and its tag numbers", async ({ page }) => {
  await openCalendar(page);
  const sheet = await openSettings(page);
  await expect(headingOf(sheet, "Karten")).toContainText("0 Karten");
  const cards = await panel(sheet, "Karten");
  await cards.getByRole("button", { name: "＋ Neue Karte" }).click();
  await cards.getByLabel("Name").fill("Spielplatz");
  await cards.getByLabel("NFC-Nummern").fill("04a1b2c3, 04b2c3d4");
  /* No picture, no card: the button waits for the search to answer. */
  await expect(cards.getByRole("button", { name: "Fertig" })).toBeDisabled();
  await cards.getByLabel("Symbol suchen").fill("Spielplatz");
  await cards.getByRole("button", { name: "Spielplatz", exact: true }).click();
  await cards.getByRole("button", { name: "Fertig" }).click();
  /* The editor makes way for the list once the card is written. */
  await expect(cards.getByRole("button", { name: "Fertig" })).toBeHidden();
  await expect(cards.getByText("Spielplatz", { exact: true })).toBeVisible();
  /* Written down in one spelling however it was pasted. */
  await expect(cards.getByText("04A1B2C3, 04B2C3D4")).toBeVisible();
  await expect(headingOf(sheet, "Karten")).toContainText("1 Karte");
});

test("the chosen voice is remembered across a reload", async ({ page }) => {
  await stubSpeech(page);
  await openCalendar(page);
  let sheet = await openSettings(page);
  await expect(headingOf(sheet, "Stimme")).toContainText("keine gewählt");
  const voice = await panel(sheet, "Stimme");
  await voice.getByRole("radio", { name: /Testa/ }).click();
  await expect(voice.getByRole("radio", { name: /Testa/ })).toBeChecked();
  await expect(headingOf(sheet, "Stimme")).toContainText("Testa");
  await expect(page.getByRole("status").filter({ hasText: "Der Kalender spricht jetzt mit Testa." })).toHaveCount(1);

  await page.reload();
  sheet = await openSettings(page);
  await expect(headingOf(sheet, "Stimme")).toContainText("Testa");
});

test("the calendar's look is remembered, and applied before the sheet is opened again", async ({ page }) => {
  await openCalendar(page);
  const shade = () => page.locator("body").evaluate(node => {
    const [r, g, b] = getComputedStyle(node).backgroundColor.match(/\d+/g)!.map(Number);
    return (r + g + b) / 3;
  });
  const light = await shade();
  let sheet = await openSettings(page);
  await expect(headingOf(sheet, "Aussehen")).toContainText("Wie das Gerät");
  const look = await panel(sheet, "Aussehen");
  await look.getByRole("group", { name: "Aussehen" }).getByRole("button", { name: "Dunkel" }).click();
  await expect(headingOf(sheet, "Aussehen")).toContainText("Dunkel");
  expect(await shade()).toBeLessThan(light);

  await page.reload();
  await expect(page.getByRole("button", { name: "＋ Termin" })).toBeVisible();
  expect(await shade()).toBeLessThan(light);
  sheet = await openSettings(page);
  await expect(headingOf(sheet, "Aussehen")).toContainText("Dunkel");
});

test("the Ablage and Sicherung panels are there and say where things are", async ({ page }) => {
  /* Both are shared panels from @lautstark/sicherung. Their insides belong to
     that package's own suite; what this calendar owes is that they are present,
     named, and answer the empty state in its words. */
  await openCalendar(page);
  const sheet = await openSettings(page);
  await expect(headingOf(sheet, "Ablage")).toContainText("Kein Ordner — der Kalender liegt nur hier.");
  await expect(headingOf(sheet, "Sicherung")).toContainText("Nur von Hand");
  const ablage = await panel(sheet, "Ablage");
  await expect(ablage.getByRole("button", { name: "Ordner wählen …" })).toBeVisible();
  const keeping = await panel(sheet, "Sicherung");
  await expect(keeping.getByText("Noch kein Ordner für Sicherungskopien.")).toBeVisible();
  await expect(keeping.getByRole("button", { name: "Ordner wählen", exact: true })).toBeVisible();
  await expect(keeping.getByRole("button", { name: "Sicherung als Datei" })).toBeVisible();
  await expect(keeping.getByRole("button", { name: "Sicherung einlesen" })).toBeVisible();
});

test("emptying the calendar counts what goes, and keeps the people", async ({ page }) => {
  await openCalendar(page, {
    appointments: [timed(WEEK[1], "10:00", "11:00", "Turnen"), timed(WEEK[3], "10:00", "11:00", "Logopädie")],
    people: [person("Oma")],
  });
  const sheet = await openSettings(page);
  const data = await panel(sheet, "Löschen");
  await data.getByRole("button", { name: "Alle Termine löschen" }).click();
  const asking = page.getByRole("dialog", { name: "Alle Termine löschen" });
  await expect(asking.getByText("2 Termine werden gelöscht. Karten und Personen bleiben.")).toBeVisible();
  await asking.getByRole("button", { name: "Termine löschen" }).click();
  await expect(asking).toBeHidden();
  await expect(headingOf(sheet, "Personen")).toContainText("1 Person");
  await sheet.getByRole("button", { name: "Fertig" }).click();
  await expect(inWeek(page, "Turnen")).toHaveCount(0);
  await expect(page.getByText("Noch nichts geplant")).toBeVisible();
});
