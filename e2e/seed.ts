import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import type { Appointment, Card, Person, Series, Settings, SymbolRef } from "../src/model.js";

/*
 * What the behaviour specs share: a fixed moment, an invented week, and the
 * three things a browser would otherwise reach for that a test may not —
 * ARASAAC, a voice, and the screen.
 *
 * ## The week is invented and written straight into IndexedDB
 *
 * Nothing seeds the product (README: "Nothing is seeded"), so a test that
 * needs a week either clicks one together — a minute per test, and a test of
 * the dialog rather than of the board — or writes the records the calendar
 * would have written. This does the second, the way the site screenshots are
 * made: the page is opened once so the product creates the database in its own
 * version with its own stores, then the records go in through a second
 * connection, then the page is reloaded. No household's week is in here; the
 * appointments are the shapes docs/product.md describes and nothing else.
 *
 * ## Nothing leaves the machine
 *
 * Every request to a host other than the dev server is refused, and the two
 * ARASAAC endpoints are answered here: the search with one pictogram named
 * after the word that was searched, the picture with a one-pixel PNG. So a
 * symbol is always found, always drawn, and never fetched — and the suite runs
 * the same on a laptop in a tunnel and on the runner. METACOM is never
 * involved: without a folder the product draws from ARASAAC, which is the one
 * state a public test may show.
 *
 * ## The moment is fixed, not the timers
 *
 * `page.clock.setFixedTime` pins `Date` and leaves every timer real. The board
 * is a projection of one moment against one week, so pinning the moment is
 * what makes the seeded week *this* week and 09:30 *this* minute; leaving the
 * timers real is what lets the search debounce, the toast rest and the speech
 * stub's `onend` still fire. Tuesday 2026-09-01 is the same day the unit tests
 * use, and 09:30 is a minute inside a Kita morning.
 */

export const MONDAY = "2026-08-31";
export const TUESDAY = "2026-09-01";
export const WEEK = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"] as const;

/** Pin the clock to one minute of the seeded week. Berlin summer time. */
export async function at(page: Page, time: string, date: string = TUESDAY): Promise<void> {
  await page.clock.setFixedTime(new Date(`${date}T${time}:00+02:00`));
}

/* One transparent pixel. Enough for `<img>` to load and for bildquelle to cache. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/* A stable pictogram number per word, so a symbol seeded here and the same
   symbol picked out of the mocked search are one reference. */
const idOf = (word: string) => {
  let sum = 7;
  for (const char of word.toLowerCase()) sum = (sum * 31 + char.charCodeAt(0)) % 90000;
  return String(10000 + sum);
};

export const symbol = (label: string): SymbolRef => ({ source: "arasaac", id: idOf(label), label });

/** Refuse the network, and answer ARASAAC locally. Register before `goto`. */
export async function offline(page: Page): Promise<void> {
  /* Registered first, so it is asked last: Playwright matches routes in reverse
     order of registration. */
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  await page.route("https://static.arasaac.org/**", route => route.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("https://api.arasaac.org/v1/pictograms/de/search/*", route => {
    const word = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
    const label = word.charAt(0).toUpperCase() + word.slice(1);
    return route.fulfill({ json: [{ _id: Number(idOf(word)), keywords: [{ keyword: label, type: 2 }], aac: true, aacColor: true }] });
  });
}

/* Records the way the calendar writes them. `updatedAt: 0` is what a fresh
   draft carries; the store stamps its own on the way in. */
export const timed = (date: string, start: string, end: string, title: string, extra: Partial<Appointment> = {}): Appointment =>
  ({ id: randomUUID(), date, start, end, title, symbols: [symbol(title)], options: [], people: [], showPeople: false, updatedAt: 0, ...extra });
export const wholeDay = (date: string, title: string, extra: Partial<Appointment> = {}): Appointment =>
  ({ id: randomUUID(), date, title, symbols: [symbol(title)], options: [], people: [], showPeople: false, updatedAt: 0, ...extra });
export const card = (name: string, nfc?: string, speech?: string): Card =>
  ({ id: randomUUID(), name, symbol: symbol(name), nfc, speech, updatedAt: 0 });
export const person = (name: string, birthday?: string): Person =>
  ({ id: randomUUID(), name, initials: name.slice(0, 2).toUpperCase(), tone: "#4f8fd6", birthday, updatedAt: 0 });

export type Seed = {
  appointments?: Appointment[]; cards?: Card[]; people?: Person[]; series?: Series[];
  settings?: Settings;
};

/**
 * Write records into the product's own database. The page must have opened the
 * route once already, so the database exists in the product's version.
 *
 * The store names and the settings key are src/db.ts's — the one place this
 * suite reaches past the screen, and it does so only to arrive at a state a
 * household would have reached by planning.
 */
export async function seed(page: Page, data: Seed): Promise<void> {
  await page.evaluate(async data => {
    const db = await new Promise<IDBDatabase>((ok, no) => {
      const request = indexedDB.open("wochenwerk");
      request.onsuccess = () => ok(request.result);
      request.onerror = () => no(request.error);
    });
    const writing = db.transaction(["appointments", "cards", "people", "series", "settings"], "readwrite");
    for (const record of data.appointments ?? []) writing.objectStore("appointments").put(record);
    for (const record of data.cards ?? []) writing.objectStore("cards").put(record);
    for (const record of data.people ?? []) writing.objectStore("people").put(record);
    for (const record of data.series ?? []) writing.objectStore("series").put(record);
    if (data.settings) writing.objectStore("settings").put({ ...data.settings, id: "household" });
    await new Promise<void>((ok, no) => { writing.oncomplete = () => ok(); writing.onerror = () => no(writing.error); });
    db.close();
  }, data);
}

/** The board at `/`, empty or with a week in it. */
export async function openBoard(page: Page, data?: Seed): Promise<void> {
  await offline(page);
  await page.goto("/");
  await expect(page.getByText("Diese Woche ist noch nichts geplant.")).toBeVisible();
  if (!data) return;
  await seed(page, data);
  await page.reload();
  if (data.appointments?.length || data.series?.length) await expect(board(page).getByText("DI", { exact: true })).toBeVisible();
}

/** The calendar at `/kalender/`, empty or with a week in it. */
export async function openCalendar(page: Page, data?: Seed): Promise<void> {
  await offline(page);
  await page.goto("/kalender/");
  await expect(page.getByRole("button", { name: "＋ Termin" })).toBeVisible();
  if (!data) return;
  await seed(page, data);
  await page.reload();
  await expect(page.getByRole("button", { name: "＋ Termin" })).toBeVisible();
  if (data.appointments?.length || data.series?.length) await expect(page.getByText("Noch nichts geplant")).toBeHidden();
}

/* ## The board, as words
 *
 * The board has no controls and no text a child reads, so it has no roles to
 * find things by. These three are the whole of what the board specs know about
 * its markup: a day is the section carrying the weekday's two letters, a card
 * is `.card` inside it, a whole-day bar is `.span`, and the tray over the slot
 * is `.offerbox`. Everything
 * else is asserted as position, size and colour — what a person sees. */
export const board = (page: Page): Locator => page.getByRole("main", { name: "Wochenplan" });
export const column = (page: Page, weekday: string): Locator =>
  board(page).locator("section").filter({ has: page.getByText(weekday, { exact: true }) });
export const cards = (day: Locator): Locator => day.locator(".card");
export const tray = (page: Page): Locator => board(page).locator(".offerbox");
/** The bars across the head of the week: what lasts all day, one per stretch. */
export const bars = (page: Page): Locator => board(page).locator(".span");

/* ## A voice that writes down what it was asked to say
 *
 * The board only ever speaks; nothing it says is written on screen. A system
 * voice goes through the Web Speech API, so a stub of that API is the one
 * observable seam: every utterance's text lands in `window.__spoken` in the
 * order it was spoken, and `onend` fires a moment later so the board moves on
 * to the next sentence the way it does with a real voice. The voice is listed
 * under the name „Testa", which is what the settings show for it. */
export const VOICE = "system:test-de";

export async function stubSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const voices = [{ voiceURI: "test-de", name: "Testa", lang: "de-DE", localService: true, default: true }];
    window.__spoken = [];
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => voices,
        speak(utterance: { text: string; onend?: (event: unknown) => void }) {
          window.__spoken!.push(utterance.text);
          setTimeout(() => utterance.onend?.({}), 30);
        },
        cancel() {}, pause() {}, resume() {},
        addEventListener() {}, removeEventListener() {},
        speaking: false, pending: false, paused: false,
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class { text: string; constructor(text: string) { this.text = text; } },
    });
  });
}

export const spoken = (page: Page) => page.evaluate(() => window.__spoken ?? []);

/* ## A screen that can be asked for
 *
 * Headless Chromium grants no fullscreen and holds no wake lock, so both are
 * answered here and counted. `fullscreenElement` follows the request the way
 * the platform's would, and `fullscreenchange` fires, which is what the board
 * listens for before it asks the screen to stay lit. */
export async function stubScreen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let full = false;
    window.__screen = { entered: 0, left: 0, locks: [], released: 0 };
    Object.defineProperty(Document.prototype, "fullscreenElement", {
      configurable: true, get: () => (full ? document.documentElement : null),
    });
    Element.prototype.requestFullscreen = async function () {
      full = true; window.__screen!.entered++;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
    Document.prototype.exitFullscreen = async function () {
      full = false; window.__screen!.left++;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async (kind: string) => {
          window.__screen!.locks.push(kind);
          return { addEventListener() {}, release: async () => { window.__screen!.released++; } };
        },
      },
    });
  });
}

export const screen = (page: Page) => page.evaluate(() => window.__screen!);

declare global {
  interface Window {
    __spoken?: string[];
    __screen?: { entered: number; left: number; locks: string[]; released: number };
    __keys?: [string, boolean][];
  }
}
