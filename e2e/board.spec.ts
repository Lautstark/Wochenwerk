import { expect, test, type Locator, type Page } from "@playwright/test";
import { at, bars, board, card, cards, column, openBoard, screen, spoken, stubScreen, stubSpeech, timed, tray, VOICE, WEEK, wholeDay, type Seed } from "./seed.js";

/*
 * The board, as a child sees it and a parent hears it.
 *
 * The board is a projection of one moment against one week (docs/product.md),
 * so every test here pins the moment and seeds the week, and then asks what is
 * on the wall: which column is today, which card is lifted, how tall a
 * two-hour card is beside a one-hour one, and what the button says. Nothing is
 * asserted about how the board is built — a card is found inside the day it
 * belongs to, and then measured and coloured like anything else on a screen.
 *
 * The clock is 09:30 on Tuesday 2026-09-01 unless a test says otherwise: a
 * Kita morning, with breakfast behind it and Turnen after lunch. Speech is the
 * stubbed system voice from seed.ts, which writes down what it was asked to say
 * instead of saying it.
 *
 * What is deliberately not here: the board has no navigation — no keys walk
 * days or appointments, because a two-year-old is not offered a way to leave
 * today (docs/ux.md) — and the minute tick that carries a calendar change onto
 * the wall runs on the real clock, sixty seconds apart, which a test may not
 * wait for.
 */

/* The week the tests share: the shapes product.md names, nobody's own routine. */
const kita = (date: string) => timed(date, "08:00", "12:00", "Kindergarten");
const week = (): Seed => ({
  appointments: [
    kita(WEEK[0]),
    timed(WEEK[1], "07:00", "08:00", "Frühstück"), kita(WEEK[1]), timed(WEEK[1], "12:15", "13:15", "Turnen"),
    kita(WEEK[2]), timed(WEEK[2], "10:00", "11:00", "Logopädie"),
    kita(WEEK[3]),
    timed(WEEK[4], "15:00", "16:00", "Schwimmen"),
    timed(WEEK[5], "10:00", "12:00", "Spielplatz"),
    wholeDay(WEEK[6], "Ausflug"),
  ],
  settings: { voice: VOICE },
});

/* Cards on the table, and a choice between two of them. */
const spielplatz = card("Spielplatz", "04A1B2C3");
const laufrad = card("Laufrad", "04B2C3D4", "Laufrad fahren");
const zahn = card("Zähneputzen", "04C3D4E5");
const choice = (start: string, end: string) =>
  timed(WEEK[1], start, end, "Nachmittag", { symbols: [], options: [spielplatz.id, laufrad.id] });
const afternoon = (start: string, end: string): Seed => ({
  cards: [spielplatz, laufrad, zahn],
  appointments: [kita(WEEK[1]), choice(start, end)],
  settings: { voice: VOICE },
});

const backgroundOf = (node: Locator) => node.evaluate(el => getComputedStyle(el).backgroundColor);
const shadowOf = (node: Locator) => node.evaluate(el => getComputedStyle(el).boxShadow);
async function box(locator: Locator) {
  const found = await locator.boundingBox();
  expect(found, "the element has a box on screen").not.toBeNull();
  return found!;
}

/* The reader's door: a tag read at the slot arrives as this event, from the
   bridge in production and from here in a test. `null` is the card taken out. */
const slot = (page: Page, uid: string | null) =>
  page.evaluate(uid => { dispatchEvent(new CustomEvent("karte", { detail: uid })); }, uid);

test.beforeEach(async ({ page }) => { await stubSpeech(page); await at(page, "09:30"); });

test("an empty board says so, and points at the calendar", async ({ page }) => {
  await openBoard(page);
  await expect(board(page).getByText("Diese Woche ist noch nichts geplant.")).toBeVisible();
  await expect(board(page).getByText("Im Kalender anlegen")).toBeVisible();
});

test("the week stands in seven columns, today widest and carrying the clock", async ({ page }) => {
  await openBoard(page, week());
  const heads = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];
  const dates = ["31.8.", "1.9.", "2.9.", "3.9.", "4.9.", "5.9.", "6.9."];
  for (const [index, day] of heads.entries()) {
    await expect(column(page, day)).toHaveCount(1);
    await expect(column(page, day)).toContainText(dates[index]!);
  }
  await expect(column(page, "DI")).toContainText("09:30");
  await expect(column(page, "MI")).not.toContainText("09:30");
  const today = await box(column(page, "DI"));
  for (const day of heads.filter(day => day !== "DI")) expect((await box(column(page, day))).width).toBeLessThan(today.width);
});

test("each day is a field of its own colour, and a day that is over has faded", async ({ page }) => {
  await openBoard(page, week());
  const fields = await Promise.all(["MO", "DI", "MI", "DO", "FR", "SA", "SO"].map(day => backgroundOf(column(page, day))));
  expect(new Set(fields).size).toBe(7);
  /* Monday is behind us: its head is dimmed the way nothing ahead is. */
  const dimming = (day: string) => column(page, day).locator("header").evaluate(el => Number(getComputedStyle(el).opacity));
  expect(await dimming("MO")).toBeLessThan(await dimming("DI"));
  expect(await dimming("MI")).toBe(await dimming("DI"));
});

test("a card's height is its duration", async ({ page }) => {
  await openBoard(page, week());
  const today = cards(column(page, "DI"));
  await expect(today).toHaveCount(3);
  const [breakfast, kindergarten, turnen] = await Promise.all([0, 1, 2].map(index => box(today.nth(index))));
  /* Four hours against one, allowing for the gap the board keeps between cards
     so that two of them stay countable. */
  expect((kindergarten!.height + 5) / (turnen!.height + 5)).toBeCloseTo(4, 0);
  expect((kindergarten!.height + 5) / (breakfast!.height + 5)).toBeCloseTo(4, 0);
  /* And in the order of the day, one under the other. */
  expect(breakfast!.y + breakfast!.height).toBeLessThanOrEqual(kindergarten!.y + 1);
  expect(kindergarten!.y + kindergarten!.height).toBeLessThanOrEqual(turnen!.y + 1);
});

test("the running appointment is lifted, the finished one has faded, the next keeps its paper", async ({ page }) => {
  await openBoard(page, week());
  const today = cards(column(page, "DI"));
  const breakfast = today.nth(0), kindergarten = today.nth(1), turnen = today.nth(2);
  expect(await backgroundOf(kindergarten)).toBe("rgb(255, 255, 255)");
  expect(await backgroundOf(turnen)).toBe("rgb(255, 255, 255)");
  expect(await backgroundOf(breakfast)).not.toBe("rgb(255, 255, 255)");
  /* Lifted: what is running carries a shadow the one after it does not. */
  expect(await shadowOf(kindergarten)).not.toBe(await shadowOf(turnen));
});

test("appointments that run beside each other share the width of their day", async ({ page }) => {
  await openBoard(page, week());
  const wednesday = cards(column(page, "MI"));
  await expect(wednesday).toHaveCount(2);
  const day = await box(column(page, "MI"));
  const [kindergarten, logo] = await Promise.all([box(wednesday.nth(0)), box(wednesday.nth(1))]);
  expect(kindergarten!.width).toBeLessThan(day.width * 0.8);
  expect(logo!.width).toBeLessThan(day.width * 0.8);
  expect(kindergarten!.x).toBeLessThan(logo!.x);
  /* Both inside their hour: the therapy sits within the Kita's span. */
  expect(logo!.y).toBeGreaterThan(kindergarten!.y);
  expect(logo!.y + logo!.height).toBeLessThan(kindergarten!.y + kindergarten!.height);
});

test("a whole-day appointment is a bar over its day", async ({ page }) => {
  await openBoard(page, week());
  /* Sunday's trip has no time, so it is drawn in the band across the head of
     the week rather than as a card in the column. */
  await expect(cards(column(page, "SO"))).toHaveCount(0);
  const sunday = await box(column(page, "SO"));
  await expect(bars(page)).toHaveCount(1);
  const drawn = await box(bars(page));
  expect(drawn.x).toBeGreaterThanOrEqual(sunday.x - 1);
  expect(drawn.x + drawn.width).toBeLessThanOrEqual(sunday.x + sunday.width + 1);
});

/* ## What the button says */

test("Space announces the day, what is running, and what comes after it", async ({ page }) => {
  await openBoard(page, week());
  await page.keyboard.press("Space");
  await expect.poll(() => spoken(page)).toEqual([
    "Es ist Dienstagmorgen.",
    "Jetzt ist Kindergarten.",
    "Danach kommt Turnen.",
  ]);
});

test("a second press starts again rather than queueing", async ({ page }) => {
  await openBoard(page, week());
  await page.keyboard.press("Space");
  await expect.poll(() => spoken(page)).toHaveLength(3);
  await page.keyboard.press("Space");
  await expect.poll(() => spoken(page)).toHaveLength(6);
  expect((await spoken(page)).slice(3)).toEqual(["Es ist Dienstagmorgen.", "Jetzt ist Kindergarten.", "Danach kommt Turnen."]);
});

test("without a voice the board says so — quietly, for whoever sets it up", async ({ page }) => {
  const silent = week();
  delete silent.settings;
  await openBoard(page, silent);
  await page.keyboard.press("Space");
  await expect(page.getByText("Noch keine Stimme gewählt — Kalender → Einstellungen → Stimme.")).toBeVisible();
  expect(await spoken(page)).toEqual([]);
});

test("the dial's press asks for the announcement, and turning it does nothing", async ({ page }) => {
  await openBoard(page, week());
  await page.evaluate(() => {
    window.__keys = [];
    addEventListener("keydown", event => window.__keys!.push([event.code, event.defaultPrevented]));
  });
  await page.keyboard.press("AudioVolumeMute");
  await expect.poll(() => spoken(page)).toHaveLength(3);
  await page.keyboard.press("AudioVolumeUp");
  await page.keyboard.press("AudioVolumeDown");
  await expect.poll(() => page.evaluate(() => window.__keys)).toEqual([
    ["AudioVolumeMute", true], ["AudioVolumeUp", true], ["AudioVolumeDown", true],
  ]);
  expect(await spoken(page)).toHaveLength(3);
});

/* ## The choice at the slot */

test("an open choice stands on the tray, and while it runs the announcement is only the choice", async ({ page }) => {
  await at(page, "15:30");
  await openBoard(page, afternoon("15:00", "16:00"));
  await expect(tray(page)).toBeVisible();
  const wall = await box(board(page));
  const offered = await box(tray(page));
  /* On the bottom edge, over the slot in the frame below. */
  expect(offered.y + offered.height).toBeGreaterThan(wall.y + wall.height - 4);
  await page.keyboard.press("Space");
  await expect.poll(() => spoken(page)).toEqual([
    "Jetzt darfst du aussuchen: Spielplatz oder Laufrad fahren. Was möchtest du tun?",
  ]);
});

test("a card at the slot answers the question, is said back, and stays once the appointment has begun", async ({ page }) => {
  await at(page, "15:30");
  await openBoard(page, afternoon("15:00", "16:00"));
  await slot(page, "04a1b2c3");
  await expect.poll(() => spoken(page)).toEqual(["Du hast Spielplatz ausgesucht."]);
  await expect(tray(page)).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect.poll(() => spoken(page)).toEqual([
    "Du hast Spielplatz ausgesucht.",
    "Es ist Dienstagnachmittag.",
    "Jetzt ist Spielplatz. Das hast du ausgesucht.",
    "Heute ist nichts mehr geplant.",
  ]);
  /* Taken out again: the afternoon is already happening, so the answer stays. */
  await slot(page, null);
  await expect(tray(page)).toHaveCount(0);
  await expect.poll(() => spoken(page)).toHaveLength(4);
});

test("taking the card out before the appointment begins takes the answer back", async ({ page }) => {
  await at(page, "15:30");
  await openBoard(page, afternoon("16:00", "17:00"));
  await expect(tray(page)).toBeVisible();
  await slot(page, "04A1B2C3");
  await expect.poll(() => spoken(page)).toEqual(["Du hast Spielplatz ausgesucht."]);
  await expect(tray(page)).toHaveCount(0);
  await slot(page, null);
  await expect.poll(() => spoken(page)).toEqual(["Du hast Spielplatz ausgesucht.", "Was möchtest du tun?"]);
  await expect(tray(page)).toBeVisible();
});

test("a card that answers nothing is refused out loud, and an unknown tag is named for the parent", async ({ page }) => {
  await at(page, "15:30");
  await openBoard(page, afternoon("15:00", "16:00"));
  await slot(page, "04C3D4E5");
  await expect.poll(() => spoken(page)).toEqual([
    "Zähneputzen steht gerade nicht zur Auswahl. Du kannst Spielplatz oder Laufrad fahren wählen.",
  ]);
  /* The tray turns red, and the question is still open. */
  await expect(tray(page)).toHaveCSS("background-color", "rgb(232, 80, 60)");
  await expect(tray(page)).toBeVisible();
  await slot(page, "DEADBEEF");
  await expect(page.getByText("Unbekannte Karte: DEADBEEF")).toBeVisible();
  await expect.poll(() => spoken(page)).toHaveLength(2);
  expect((await spoken(page))[1]).toBe("Diese Karte steht gerade nicht zur Auswahl. Du kannst Spielplatz oder Laufrad fahren wählen.");
});

/* ## The screen */

test("Ctrl+Shift+F asks for the whole screen and keeps it lit, and asks again to give both back", async ({ page }) => {
  await stubScreen(page);
  await openBoard(page, week());
  await page.keyboard.press("Control+Shift+F");
  await expect.poll(() => screen(page)).toEqual({ entered: 1, left: 0, locks: ["screen"], released: 0 });
  await page.keyboard.press("Control+Shift+F");
  await expect.poll(() => screen(page)).toEqual({ entered: 1, left: 1, locks: ["screen"], released: 1 });
  /* A bare F is somebody typing, not somebody asking for the screen. */
  await page.keyboard.press("f");
  await page.keyboard.press("Shift+F");
  expect(await screen(page)).toEqual({ entered: 1, left: 1, locks: ["screen"], released: 1 });
});
