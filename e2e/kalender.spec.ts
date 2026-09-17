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

/**
 * Answers „Wiederholen", which stopped being a `<select>` in this round.
 *
 * conventions.md §6.10: a `<select>`'s open list is drawn by the operating
 * system and is the one control on a page that cannot follow the tokens, so it
 * is not what this family means by a dropdown. `selectOption` is the price —
 * it only works against a `<select>`, so the two cases that drove this control
 * are rewritten rather than retargeted, and what they say is longer because
 * what a person does is longer: press the thing that asks the question, then
 * press the answer.
 *
 * The trigger is found by the question and not by the answer standing on it,
 * which is the other half of the conversion. It was a `<label class="field-row">`
 * around the button before, and a `<label>` does not name a `<button>` — so
 * `getByLabel("Wiederholen")` would have found nothing here at all. It works
 * because the shared Dropdown takes `aria-labelledby` and the row points it at
 * the `.lbl` beside it.
 *
 * `menuitemradio` rather than `menuitem`, and that is a real assertion: menu.js
 * gives an item that role only where the caller passed `checked`, which is what
 * says these four are alternatives and which one is in force. A plain list of
 * commands would pass a name match and announce four equal things.
 */
async function repeatEvery(sheet: Locator, answer: string): Promise<void> {
  await sheet.getByLabel("Wiederholen").click();
  await sheet.getByRole("menuitemradio", { name: answer }).click();
  /* What `selectOption` gave for free: the trigger reads the answer back out of
     the draft, so this says the press reached `s.repeat` and not only the menu. */
  await expect(sheet.getByLabel("Wiederholen")).toHaveText(answer);
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

/* ## The order the symbols stand in
 *
 * The row of chosen symbols is a row, and which symbol stands first is what the
 * board draws first — so putting them in an order is a thing the sheet does and
 * not a decoration. It can be done by dragging a tile or by pressing ← and →
 * on one, and neither is arithmetic: `moved()` has its own unit test, and what
 * is left over is exactly the part that lives in the DOM. It is wired from
 * AppointmentBody through `<TileGrid>`'s spread as a Svelte attachment, which
 * means a change to the design component, to that spread, or to how Svelte
 * carries attachments can take the whole feature away without a single other
 * test noticing.
 */

/** The chosen symbols in the order they stand in.
 *
 * `[data-move]` is the one selector in this file that is not a role or a name,
 * and it is not a class name in disguise: it is the contract itself. reorder.ts
 * finds the movable tiles by that attribute and counts positions among them, so
 * a row that has lost it has lost the feature — which is the thing being asked
 * about here. Role and name would find the same buttons, but the empty slot at
 * the end is a button too, and the order they come back in is the whole
 * question. */
const chosen = (sheet: Locator) => sheet.locator("[data-move]");

/** A sheet with two symbols already in it, standing in the order they were picked. */
async function twoSymbols(page: Page): Promise<Locator> {
  const sheet = await newAppointment(page);
  await pickSymbol(sheet, "Turnen");
  await pickSymbol(sheet, "Judo");
  const row = chosen(sheet);
  await expect(row).toHaveCount(2);
  await expect(row.nth(0)).toHaveAccessibleName("Turnen");
  await expect(row.nth(1)).toHaveAccessibleName("Judo");
  return sheet;
}

test("→ on a chosen symbol carries it past its neighbour, and the focus goes with it", async ({ page }) => {
  await openCalendar(page);
  const sheet = await twoSymbols(page);
  /* The sheet says both ways are there as soon as there are two to order. */
  await expect(sheet.getByText("Zieh sie in die Reihenfolge, in der sie am Board stehen — oder ← und →.")).toBeVisible();
  const row = chosen(sheet);
  await row.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(row.nth(0)).toHaveAccessibleName("Judo");
  await expect(row.nth(1)).toHaveAccessibleName("Turnen");
  /* The row is drawn again around the new order, so the tile that moved is a
     different element than the one that was pressed. Whoever pressed the key is
     still on the symbol they moved, or a second press would move a third thing. */
  await expect(row.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(row.nth(0)).toHaveAccessibleName("Turnen");
  await expect(row.nth(1)).toHaveAccessibleName("Judo");
  /* Nothing walks off the end: ← on the first symbol leaves the row alone. */
  await page.keyboard.press("ArrowLeft");
  await expect(row.nth(0)).toHaveAccessibleName("Turnen");
  await expect(row).toHaveCount(2);
});

/**
 * The other grid that answers ← and →, and the reason this case exists.
 *
 * conventions.md §6.4 names wochenwerk's arrow collision as the one thing its
 * adoption of the shared search has to resolve: the results box gives its hits
 * a roving tabindex and claims all four arrows, and it stands one element away
 * from the row above, which has claimed ← and → for reordering since long
 * before it. Both are grids of `.picker__item`s and neither is inside the
 * other, which is what keeps them apart — but „neither is inside the other" is
 * a fact about the markup, and the markup is what an adoption changes.
 *
 * So: two symbols already in the row, focus on a tile in the *search*, and the
 * row must not move. Pressed twice, because ← and → are the two reorder.ts
 * answers and a handler that saw only one of them would pass half a test.
 */
test("arrows in the search results do not reorder the chosen row", async ({ page }) => {
  await openCalendar(page);
  const sheet = await twoSymbols(page);
  const row = chosen(sheet);
  await sheet.getByRole("button", { name: "＋ Symbol" }).click();
  await sheet.getByLabel("Symbol suchen").fill("Schwimmen");
  const hit = sheet.getByRole("button", { name: "Schwimmen", exact: true });
  await expect(hit).toBeVisible();
  await hit.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  /* Untouched, and still two: an arrow that had reached reorder.ts would have
     swapped them, and one that had reached the tile's own click would have
     taken a symbol off. */
  await expect(row.nth(0)).toHaveAccessibleName("Turnen");
  await expect(row.nth(1)).toHaveAccessibleName("Judo");
  await expect(row).toHaveCount(2);
  /* And the other way round, on the same form: the row still reorders while a
     search is open under it. */
  await row.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(row.nth(0)).toHaveAccessibleName("Judo");
  await expect(row.nth(1)).toHaveAccessibleName("Turnen");
});

/** Drags one tile onto another the way a hand does: press, travel, let go.
    In steps, because a press is a click until it has passed reorder.ts's 6px of
    grip — the travelling is what turns it into a drag, and a single jump would
    be one pointermove where a hand makes many. */
async function dragOnto(page: Page, tile: Locator, onto: Locator): Promise<void> {
  const held = await box(tile), target = await box(onto);
  await page.mouse.move(held.x + held.width / 2, held.y + held.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
}

test("a chosen symbol dragged past its neighbour swaps with it, and is not taken off", async ({ page }) => {
  await openCalendar(page);
  const sheet = await twoSymbols(page);
  const row = chosen(sheet);
  await dragOnto(page, row.nth(0), row.nth(1));
  await expect(row.nth(0)).toHaveAccessibleName("Judo");
  await expect(row.nth(1)).toHaveAccessibleName("Turnen");
  /* A tile is also the button that takes its symbol off again, and a drag ends
     over one with the pointer going up — which is a click as far as the browser
     is concerned. Both symbols are still here, so that click was swallowed. */
  await expect(row).toHaveCount(2);
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
  await repeatEvery(sheet, "wöchentlich");
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
  await repeatEvery(sheet, "wöchentlich");
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

/* ## The foot of the page, and the three pages it opens
 *
 * New surfaces, and until now uncovered because there was nothing to cover:
 * wochenwerk had no footer, no Impressum and no Datenschutz, and it is the last
 * of the four products to get them. So these assertions are about the two
 * things nobody else can check for this product — that the obligations are
 * reachable and named the way the law names them, and that every path the
 * privacy notice claims is a path this repository actually has.
 *
 * The shell is `@lautstark/design/svelte/Footer` and `.../Legal`; what those
 * draw belongs to that package's suite. What is here is the product's words,
 * the product's order, and the two behaviours §6.12 makes the component
 * responsible for and which a consumer can silently lose.
 */

/** The page's own footer, which is the one `contentinfo` landmark on it. */
const foot = (page: Page) => page.getByRole("contentinfo");

/**
 * Opens one of the three pages and hands back the dialog.
 *
 * Two names, because they are two different things. The footer says „Über
 * Wochenwerk"; the page it opens is headed „Was ist Wochenwerk?", and that
 * heading is the dialog's accessible name — one dialog whose name follows the
 * page showing in it, which is §6.12's thunk and the thing worth asserting.
 */
async function openLegal(page: Page, link: string, named = link): Promise<Locator> {
  await foot(page).getByRole("button", { name: link }).click();
  const sheet = page.getByRole("dialog", { name: named });
  await expect(sheet).toBeVisible();
  return sheet;
}

test("the foot of the page carries the three pages a German site has to carry", async ({ page }) => {
  await openCalendar(page);
  /* One landmark, not two. The status line under the week was a `<footer>`
     until this round and is a `<div>` now: two `<footer>`s that are both
     children of `.shell` would be two `contentinfo`s on one page. */
  await expect(page.getByRole("contentinfo")).toHaveCount(1);
  /* Buttons, because what the first three open is a dialog in this page rather
     than another document. The fourth is the only anchor. */
  for (const name of ["Über Wochenwerk", "Impressum", "Datenschutz"]) {
    await expect(foot(page).getByRole("button", { name })).toBeVisible();
  }
  await expect(foot(page).getByRole("link", { name: "Quellcode" }))
    .toHaveAttribute("href", "https://github.com/Lautstark/Wochenwerk");
  /* The status line is still a live region and still under the week, which is
     what it was and what the footer must not have absorbed. */
  await expect(page.locator(".pagefoot .line")).toHaveAttribute("role", "status");
});

test("what ARASAAC's licence is owed stands in the footer, and only while its symbols are drawn", async ({ page }) => {
  /* The attribution moved out of the status row into the shared footer's
     `credit` — §6.12, where it is described as exactly this: one line that
     follows the source in force, empty when none is, and drawn as a paragraph
     only then. It is a licence condition rather than a courtesy, so which of
     the two states it is in is worth an assertion in both directions.
   *
   * It follows the symbols the *week* draws and not the collection somebody
   * happens to be searching in, which is why the empty week has no line and a
   * week with one ARASAAC symbol in it does. */
  await openCalendar(page);
  await expect(foot(page).locator(".footer__credit")).toHaveCount(0);

  await openCalendar(page, { appointments: [timed(WEEK[1], "10:00", "11:00", "Turnen")] });
  await expect(inWeek(page, "Turnen")).toBeVisible();
  await expect(foot(page).locator(".footer__credit")).toContainText("ARASAAC");
});

test("the Impressum names who publishes this, by the word § 5 DDG uses", async ({ page }) => {
  await openCalendar(page);
  /* Called „Impressum" in the footer and „Impressum" in the heading. § 5 DDG
     asks that the page be easy to recognise as the page it is, and that is the
     word the law names — so this assertion is the obligation rather than a
     spelling preference. */
  const sheet = await openLegal(page, "Impressum");
  await expect(sheet.getByRole("heading", { name: "Angaben gemäß § 5 DDG" })).toBeVisible();
  await expect(sheet).toContainText("Stefanie Grewenig");
  await expect(sheet).toContainText("21149 Hamburg");
  await expect(sheet.getByRole("link", { name: "steffi@lautstark.tech" }))
    .toHaveAttribute("href", "mailto:steffi@lautstark.tech");
});

test("the Datenschutz names every path out of this browser, and no path this product has not", async ({ page }) => {
  await openCalendar(page);
  const sheet = await openLegal(page, "Datenschutz");
  /* One heading per way out, and the list is the one src/ actually has:
     GitHub Pages serves the page, bildquelle asks ARASAAC, stimmquelle fetches
     a piper model from Hugging Face, the browser's own voices may speak over
     the network, and Azure is asked only with a key somebody typed. */
  for (const heading of [
    "Hosting und Server-Logs",
    "Suche bei ARASAAC",
    "Stimmen von Hugging Face",
    "Stimmen deines Geräts",
    "Azure Speech, nur mit eigenem Schlüssel",
  ]) {
    await expect(sheet.getByRole("heading", { name: heading })).toBeVisible();
  }
  /* And the two the siblings carry that this product must never claim, because
     it has neither. vorlaut fetches onnxruntime from jsDelivr; wochenwerk
     bundles it (`piperVendor` in vite.config.ts). bildhaft and mitreden fetch a
     ready-made Sammlung from lautstark.tech behind `?sammlung=`; there is no
     such link here and no such fetch. A privacy notice that names a transfer
     which does not happen is as wrong as one that hides one. */
  await expect(sheet).not.toContainText("jsDelivr");
  await expect(sheet).not.toContainText("?sammlung=");
  /* The cookie is this product's alone, and it is disclosed with what it holds
     and what turns it on — a person cannot consent to what they were not told. */
  await expect(sheet).toContainText("lautstark-ordner");
});

test("the legal pages are du throughout, the privacy notice included", async ({ page }) => {
  await openCalendar(page);
  /* The house rule, and the one a copied paragraph is most likely to break:
     three of the four products' notices were written together, and a sentence
     lifted out of a Sie-form template reads as correct on its own. Asserted
     over all three pages at once, and over the prose as a reader sees it. */
  for (const [link, named] of [["Über Wochenwerk", "Was ist Wochenwerk?"],
    ["Impressum", "Impressum"], ["Datenschutz", "Datenschutz"]]) {
    const sheet = await openLegal(page, link!, named);
    const words = (await sheet.innerText()).replace(/\s+/g, " ");
    expect(words, `„${named}“ is written in du`)
      .not.toMatch(/\b(Sie|Ihnen|Ihre[nmrs]?|Ihr)\b/);
    await sheet.getByRole("button", { name: "Schließen" }).click();
    await expect(sheet).toBeHidden();
  }
});

test("one dialog with three pages in it, and the two not showing stay in the document", async ({ page }) => {
  await openCalendar(page);
  /* §6.12: every section is drawn and the ones not showing are `hidden`. Three
     separate dialogs would be three chances for one of them to be reachable and
     the others not, which is the failure both legal pages exist against — and
     it is the sheet's accessible name that has to follow the page rather than
     the sheet being rebuilt. */
  const sheet = await openLegal(page, "Datenschutz");
  await expect(sheet.locator("#privacyPage")).toBeVisible();
  await expect(sheet.locator("#impressumPage")).toBeHidden();
  await expect(sheet.locator("#aboutPage")).toBeHidden();
  /* Still in the document, hidden rather than unmounted. */
  await expect(sheet.locator("#impressumPage")).toHaveCount(1);
  await expect(sheet.locator("#aboutPage")).toHaveCount(1);
});

test("a legal page opens from the top, however far the last reader scrolled", async ({ page }) => {
  await openCalendar(page);
  /* The only behaviour in either shared component that is not markup. The sheet
     keeps its scroll position, and the privacy notice is long enough that
     reopening it half way down reads as a page starting in the middle of a
     sentence. */
  const sheet = await openLegal(page, "Datenschutz");
  /* The body, which is the element the component resets and therefore the one
     that has to be the scroller. kalender.css makes it one for this dialog and
     says why; a `<dialog>` scrolls itself in the user agent's stylesheet, and
     the reset would land on an element whose scrollTop is always zero.

     Held by the dialog's id rather than through `sheet`, because `sheet` is
     named after the page showing in it — which is the point of the component
     and would make this locator stop resolving the moment a second page
     opens. */
  const body = page.locator("#legal > .body");
  await body.evaluate(node => { node.scrollTop = 400; });
  expect(await body.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await sheet.getByRole("button", { name: "Schließen" }).click();
  await expect(sheet).toBeHidden();
  await openLegal(page, "Impressum");
  expect(await body.evaluate(node => node.scrollTop)).toBe(0);
});

test("the calendar tells the browser chrome which scheme is in force, and the board does not", async ({ page }) => {
  /* The defect adopting @lautstark/design/svelte/ThemePicker came with, and the
     narrow one: the boot snippet was always in kalender/index.html, but nothing
     called `initTheme`, so nothing subscribed to the operating system changing
     its mind and the chrome paint never ran. There was no `theme-color` meta on
     either page.
   *
   * Asserted as the resolved `--bg` rather than as a colour written here: the
   * meta is set from the token, so a moved accent moves this with it. */
  await openCalendar(page);
  const painted = () => page.locator('meta[name="theme-color"]').getAttribute("content");
  const bg = () => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  expect(await painted()).toBe(await bg());

  const sheet = await openSettings(page);
  const look = await panel(sheet, "Aussehen");
  await look.getByRole("group", { name: "Aussehen" }).getByRole("button", { name: "Dunkel" }).click();
  expect(await painted()).toBe(await bg());

  /* And the board next door must not have gained one. It is a display on a wall
     and style.css commits it to dark; its index.html carries no boot snippet for
     the same reason and says so in a comment. */
  await page.goto("/");
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(0);
});
