import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * Pixel baselines for the settings dialog.
 *
 * These exist for one job: CSS is about to leave this product and move into
 * @lautstark/design, and the move is supposed to change nothing on screen. A
 * refactor that is supposed to change nothing is exactly the refactor no
 * behavioural test can check — every assertion in test/ and every sibling suite
 * would stay green while a panel's padding halved. So the check is the pixels,
 * and it is worth only as much as it is stable: a screenshot test that goes red
 * on its own is a screenshot test people re-record without looking, which is
 * worse than not having one.
 *
 * The board at `/` is deliberately not here and must not be added. It is a
 * display on a wall with its own system of weekday colours, style.css commits it
 * to dark, and it is not part of what is being unified — a baseline of it would
 * be a baseline of something nobody intends to hold still.
 *
 * ## What makes these deterministic
 *
 * The database starts empty and nothing seeds it: Playwright gives every test a
 * fresh browser context, so IndexedDB, localStorage and the folder cookie the
 * Ablage panel reads are all empty on arrival. The empty state is therefore the
 * fixed state, and it is the right one to hold anyway — it is what every panel
 * in this dialog was drawn for and the only one that does not depend on what
 * somebody happened to plan this week.
 *
 * Two panels are answered asynchronously (`Stimme` and `Sprachdienst` say „Wird
 * geladen …" until the voice catalogue arrives), so `openSettings` waits that
 * out rather than racing it. Everything else that could still move is pinned by
 * name before the shutter opens — see HEADINGS below, which is where the
 * masking argument is written out.
 */

/** The panel with this heading. `details.panel`, the accordion in the dialog. */
function panel(page: Page, heading: string): Locator {
  return page.locator("details.panel")
    .filter({ has: page.locator("summary .section", { hasText: heading }) });
}

/** A panel's heading state — the one line that answers without unfolding. */
const state = (page: Page, heading: string) => panel(page, heading).locator("summary .state");

/**
 * Opens the calendar's settings dialog, settled.
 *
 * The wait is not politeness. Both speech panels are painted twice — once
 * saying „Wird geladen …" and again once the catalogue has been read out of the
 * database and, where there is a key, off Azure. Shooting between the two is a
 * baseline of a loading state, and which one you get depends on how busy the
 * machine is.
 */
async function openSettings(page: Page): Promise<Locator> {
  await page.goto("/kalender/");
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  const sheet = page.locator("dialog.sheet");
  await expect(sheet).toBeVisible();
  await expect(page.getByText("Wird geladen …")).toHaveCount(0);
  return sheet;
}

/** Unfolds one panel and hands it back. `name=settings` closes the others. */
async function open(page: Page, heading: string): Promise<Locator> {
  const node = panel(page, heading);
  await node.locator("summary").click();
  await expect(node).toHaveJSProperty("open", true);
  return node;
}

/* One set of pictures per platform, and what decides whether they run.
 *
 * Playwright files a snapshot under the platform that drew it, because that is
 * what draws it: the same CSS on Linux and on macOS disagrees on every
 * antialiased edge. A platform with no baseline of its own is not looking at a
 * regression — it is looking at nothing — and Playwright's own default is to
 * write the missing file and pass, which is a green tick for a comparison that
 * did not happen.
 *
 * This used to be answered by `ignoreSnapshots: !!process.env.CI` in the config,
 * and that was worse than it looked. It turned the comparison off by an
 * environment variable, and every local verification of this suite was run as
 * `CI=true` — so the pictures went uncompared here too, and a stale baseline sat
 * unnoticed through several commits that claimed to have checked it.
 *
 * So the question is asked of the directory rather than of the environment: are
 * there pictures for the platform this is running on? Committing them is the
 * whole of turning the comparison on, and there is no flag to forget to put
 * back. bildhaft wrote this first; mitreden and vorlaut-editor carry it too.
 *
 * To give a platform baselines, run .github/workflows/baselines.yml there — or
 * locally, `npx playwright test e2e/visual.spec.ts --update-snapshots`. */
const SNAPSHOTS = fileURLToPath(new URL("./visual.spec.ts-snapshots", import.meta.url));

function recordedHere(): boolean {
  if (!existsSync(SNAPSHOTS)) return false;
  return readdirSync(SNAPSHOTS).some((name) => name.endsWith(`-${process.platform}.png`));
}

test.beforeEach(async ({}, testInfo) => {
  /* 'missing' and 'none' only ever compare; 'all' and 'changed' write — and a
     run that is here to write must not skip itself out of ever producing a
     first baseline. */
  const recording = testInfo.config.updateSnapshots === "all"
    || testInfo.config.updateSnapshots === "changed";
  test.skip(!recording && !recordedHere(),
    `No baseline recorded for ${process.platform}. See the note in this file.`);
});

test("the folder picker is available, so the panels below are the ones with folders in them", async ({ page }) => {
  await page.goto("/kalender/");
  /*
   * Asserted rather than masked, and asserted first.
   *
   * Both folder panels ask the browser whether it can open a directory and draw
   * something entirely different where it cannot — „Dieser Browser kann keinen
   * Ordner öffnen" instead of the whole picker. That is not a wobble to paper
   * over; it is a different panel. If a future Chromium or a different headless
   * mode stops offering `showDirectoryPicker`, three baselines below go red at
   * once and every one of them reads as a CSS regression. This says the real
   * reason in one line instead.
   */
  expect(await page.evaluate(() => "showDirectoryPicker" in window)).toBe(true);
});

/**
 * Every heading, and the line beside it. Nine answers against an empty
 * database, and all nine of them fixed.
 *
 * This is the masking, done as words.
 *
 * Masking was the first attempt and is wrong *here*, which is worth writing
 * down because it is not obvious until you look at the file it produces: the
 * state span is a stretched flex item in `summary`, so it is as wide as the row
 * whatever it says, and `mask` paints the element's box. Masking the four
 * moving-looking lines put a solid bar across four of the nine rows — half the
 * dialog gone, including the paddings and the type this baseline exists to
 * hold, and it would have hidden a colour change in that very line.
 *
 * Asserting instead loses nothing and gains the failure message. If a counter,
 * a voice catalogue or a browser capability ever does move, this goes red
 * naming the line and quoting both texts, rather than handing somebody a pixel
 * diff of a dialog to squint at. Panels whose *body* carries a date or an age —
 * every state of Sicherung except the empty one — are kept out of shot by
 * staying in the empty state rather than by being covered up.
 */
const HEADINGS: ReadonlyArray<readonly [string, string]> = [
  ["Ablage", "Kein Ordner — der Kalender liegt nur hier."],
  ["Sicherung", "Nur von Hand"],
  ["Symbole", "Noch kein METACOM-Ordner gewählt."],
  ["Stimme", "keine gewählt"],
  ["Sprachdienst", "Kein Schlüssel"],
  ["Karten", "0 Karten"],
  ["Personen", "0 Personen"],
  ["Aussehen", "Wie das Gerät"],
  ["Löschen", ""],
];

test("the settings dialog, folded", async ({ page }) => {
  const sheet = await openSettings(page);
  for (const [heading, says] of HEADINGS) {
    await expect(state(page, heading), `the „${heading}“ panel's heading state`).toHaveText(says);
  }
  await expect(sheet).toHaveScreenshot("einstellungen-dialog.png");
});

/*
 * The three panels the move is actually about, shot one at a time.
 *
 * The panel element and not the page: a full-page shot of a dialog is mostly
 * the dim behind it, and every one of these would go red together the moment
 * anything above them changed height. Unfolded, because a folded panel is one
 * line of text and the CSS being moved is all in the body.
 */

test("the Ablage panel, unfolded", async ({ page }) => {
  await openSettings(page);
  const ablage = await open(page, "Ablage");
  /* From @lautstark/sicherung/ablage-panel — the shared panel that says where
     the household's work lives. It is the same markup in four products, so a
     change here is a change everywhere, which is the reason to hold it. */
  await expect(ablage.locator(".where-panel")).toBeVisible();
  await expect(ablage).toHaveScreenshot("panel-ablage.png");
});

test("the Sicherung panel, unfolded", async ({ page }) => {
  await openSettings(page);
  const keeping = await open(page, "Sicherung");
  /* @lautstark/sicherung/backup-panel on top, this product's own file export
     under the hairline. With no folder chosen the shared half says „Noch kein
     Ordner für Sicherungskopien" and carries no age — which is why nothing in
     this shot needs masking. Every other state of this panel puts a „vor elf
     Tagen" in it, and a baseline of one of those would rot overnight. */
  await expect(keeping.getByText("Noch kein Ordner für Sicherungskopien.")).toBeVisible();
  await expect(keeping).toHaveScreenshot("panel-sicherung.png");
});

test("the Löschen panel, unfolded", async ({ page }) => {
  await openSettings(page);
  const data = await open(page, "Löschen");
  /* Two destructive buttons ranked rather than paired, which is a layout
     decision and therefore exactly what a CSS move can undo without anybody
     noticing. */
  await expect(data.getByRole("button", { name: "Alle Daten löschen" })).toBeVisible();
  await expect(data).toHaveScreenshot("panel-loeschen.png");
});
