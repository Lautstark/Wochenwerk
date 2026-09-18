import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { at, cards, column, openBoard, timed, TUESDAY } from "./seed.js";

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
  /* By name rather than by `dialog.sheet`, which stopped being one element when
     the page grew a footer: `@lautstark/design/svelte/Legal` is one dialog with
     every page in it and it stands in the document closed, so the class matches
     twice. A closed <dialog> is `display: none` and therefore not a role match,
     and the name is what tells the two apart while both are open. */
  const sheet = page.getByRole("dialog", { name: "Einstellungen" });
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
  /* @lautstark/bildquelle/metacom-panel answers '' for „no folder chosen" and
     this product supplies the fallback, exactly as „Sicherung" does one row up.
     It states what is happening rather than what is missing: with no licensed
     folder the search answers from ARASAAC, and needs no setting up to do it. */
  ["Symbole", "Von ARASAAC"],
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
 * The five panels the move is actually about, shot one at a time.
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

test("the Symbole panel, unfolded", async ({ page }) => {
  await openSettings(page);
  const symbols = await open(page, "Symbole");
  /* @lautstark/bildquelle/metacom-panel, with this calendar's own material
     around it: where METACOM belongs inside the Ablage above, which fassung the
     search prefers below.

     This shot is new with the migration and it is the one components.css asked
     for by name — its note beside `.standing.bad .dot` says the rule "changes
     nothing that was already drawn" only because no product emitted
     `.metacom-panel` yet, and that the migration is where that has to be
     checked. This is that check. `.metacom-panel` and `.metacom-panel__note` are
     drawn by @lautstark/design v1.29.0 and by nothing in this repository, so a
     regression in either is a regression in four products at once.

     Empty like the rest: no folder chosen, so the state line is the grey dot and
     „Noch kein METACOM-Ordner gewählt." and there is no count and no folder name
     to rot. */
  await expect(symbols.locator(".metacom-panel")).toBeVisible();
  await expect(symbols.getByText("Noch kein METACOM-Ordner gewählt.")).toBeVisible();
  await expect(symbols).toHaveScreenshot("panel-symbole.png");
});

test("the Stimme panel, unfolded", async ({ page }) => {
  await openSettings(page);
  const voice = await open(page, "Stimme");
  /* @lautstark/stimmquelle/voice-picker, drawn by design 1.30.0's `.voice-picker`
     rules, with this calendar's own sentence above it.
   *
   * This shot is new with the migration, and the reason it is new is the whole
   * argument for taking it. The picker was the largest hand-drawn surface in this
   * dialog and no baseline showed a single row of it: the four shots above are
   * the other panels, and the dialog shot is the column folded, where this panel
   * is one line of text. So the check that is supposed to say „the CSS moved and
   * nothing moved on screen" could not have seen this move at all — the same trap
   * vorlaut-editor's METACOM migration walked into, where every template stayed
   * byte-identical and that read as „nothing changed".
   *
   * Two things are asserted rather than left to the pixels, because a pixel diff
   * of an empty list and a pixel diff of a broken one look equally like „it
   * moved". The list has to have voices in it — piper's German catalogue ships
   * inside the package, so this is fixed without a key and without the network —
   * and the row has to be a radio, which is the one piece of this that a
   * screenshot cannot check at all. */
  await expect(voice.locator(".voice-picker")).toBeVisible();
  await expect(voice.locator('.voices [role="radio"]').first()).toBeVisible();
  /* No language chips, and not because this product asked for none. The module
     draws them only where the catalogue holds more than one language, and
     `offered()` asks stimmquelle for German — so the row is empty and
     `.voice-picker__filters:empty` takes it out of the grid. The absence is a
     consequence of the rule rather than a setting, which is worth holding: a
     release that started drawing „Alle Sprachen" over a list of one language
     would be a chip that narrows nothing. */
  await expect(voice.locator(".voice-picker__filters")).toBeHidden();

  /* Narrowed before the shutter, and both reasons are about the picture being
     worth keeping.
   *
   * The list is not fixed. `offered()` asks for the device's own voices as well
   * as the shipped ones, and on this machine that is „Anna", „Rocko" and a dozen
   * more macOS names that another laptop, or the same one after an update, does
   * not have. A baseline of that is a baseline of somebody's operating system.
   *
   * And it no longer fits. This is the second of the two changes the migration
   * makes on purpose: the 340px scroll box is gone — a wheel gesture latches to
   * the inner list for its whole run, so the sheet did not move and the panel
   * below could not be reached — and the panel is now as tall as its list. Shot
   * whole, most of the file would be the blank under a panel taller than the
   * viewport, and how much blank would depend on what the machine had to say.
   *
   * „Mitgeliefert" is the source word printed on every bundled row, so this is
   * the module's own search matching what the module's own facts line says, and
   * what is left is exactly the German piper catalogue: fixed by the version of
   * @lautstark/stimmquelle in the lockfile, and nothing else. */
  await voice.locator(".voice-picker__search .field").fill("Mitgeliefert");
  /* Named by @lautstark/stimmquelle's `labelOf` — the tier is inside the name
     because two German piper voices are both „Thorsten". Asserted as words for
     HEADINGS' reason: a failure here should say which name went missing rather
     than hand somebody a picture of a list to squint at.
   *
   * On `.voice__name` and not on the radio's accessible name, which is the whole
   * row read out — the name, then the facts, then any hint. That is right for a
   * screen reader and wrong for an assertion: it would go red the day a voice
   * changes size. */
  await expect(voice.locator(".voice__name", { hasText: "Thorsten (medium)" })).toBeVisible();
  /* The four bundled ones and nothing else — which is what says the field really
     narrowed rather than that the shot happened to be taken early. */
  await expect(voice.locator('.voices [role="radio"]')).toHaveCount(4);
  /* The pointer, off the list. It is still where it clicked the heading, the
     rows come up underneath it, and `.voice:hover` paints whichever one it
     lands on — which on this machine was none and on the Linux runner was the
     first. That is a real difference between two baselines of the same CSS, and
     it moves again the day a sentence above the list wraps differently. Only
     this shot needs it: the other four have no row that paints under a pointer.
     Not `hover: none` on the project, because the hover rule is part of what
     these baselines are here to hold. */
  await page.mouse.move(0, 0);
  await expect(voice).toHaveScreenshot("panel-stimme.png");
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

/*
 * The other dialog, and why two small pictures of it are here.
 *
 * Everything above is the settings dialog. The appointment dialog was in no
 * shot at all — and it is where four of the five rules kalender.css still keeps
 * on a shared name actually draw: `.more > summary .section` and `.state` are
 * its people fold, `.speech-row .field` and `.btn` are its Ansage row. Taking
 * those rules out and reading the elements back with getComputedStyle says they
 * are load-bearing — the heading falls to --text-dim, the state stops
 * truncating and the row it is in grows a line — and nothing in this repository
 * would have said a word about any of it. A rule that is only ever checked by
 * the person who last touched it is the state the shared `.voice*` names were
 * in when they went dead.
 *
 * Elements and not the dialog, for a reason beyond the one above: a new
 * appointment is dated today, and the Datum, Von and Bis fields are in every
 * wider shot of it. A baseline with today's date in it is red tomorrow. Neither
 * of the first two elements contains a date, a count or anything else that
 * moves — with an empty database the fold says „niemand" and the Ansage field
 * is empty with its placeholder — which is why the shot is drawn this tightly
 * rather than masked. The Wiederholen row after them does carry one, and
 * answers it the other way this suite knows: the clock is pinned, so the date
 * in it is a fact of the seed rather than of the morning the suite ran.
 */
async function openAppointment(page: Page): Promise<Locator> {
  await page.goto("/kalender/");
  await page.getByRole("button", { name: "＋ Termin" }).click();
  /* See openSettings: `dialog.sheet` matches the legal dialog too now. A draft
     has no title to be named by, so this is the role alone — which is enough,
     because the legal dialog is closed and a closed <dialog> is not a match. */
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  return sheet;
}

test("the people fold in an appointment, closed", async ({ page }) => {
  const sheet = await openAppointment(page);
  const fold = sheet.locator("details.more");
  /* The two words this holds, asserted for HEADINGS' reason. „niemand" is what
     an empty draft says, and it is the whole of what the `.state` rule is
     drawing — so a failure should name it rather than hand over a picture of
     one line of text. */
  await expect(fold.locator("summary .section")).toHaveText("Personen");
  await expect(fold.locator("summary .state")).toHaveText("niemand");
  await expect(fold).toHaveScreenshot("termin-personen.png");
});

test("the Ansage row in an appointment", async ({ page }) => {
  const sheet = await openAppointment(page);
  const row = sheet.locator(".speech-row");
  /* Empty, and saying what would be said instead — which for a draft with no
     name yet is that nothing would be. The placeholder is the only text in this
     shot and it is a function of the draft rather than of the day. */
  await expect(row.locator(".field")).toHaveValue("");
  await expect(row.locator(".field")).toHaveAttribute("placeholder", "Ohne Namen wird nichts gesagt");
  await expect(row.locator(".btn")).toBeVisible();
  await expect(row).toHaveScreenshot("termin-ansage.png");
});

/*
 * „Wiederholen" — the other row of this dialog, and the one this suite could
 * not see at all.
 *
 * What that cost was measured on 2026-09-17. Both of this product's
 * @lautstark/design/svelte/Dropdown call sites went from `.btn.dropdown` to
 * `.field.dropdown`, and this one is the larger half of that change: a trigger
 * that had been as wide as the word on it — 108px on „einmalig", bold 14px on a
 * visible pill, the one control in a column of answers that stopped early —
 * became the full 854px of that column in regular 15px on a field's fill, and
 * the row grew 3px taller. Every baseline in this directory came back
 * byte-identical. A control was redrawn, and the suite whose whole job is to
 * notice that said nothing, because no picture had ever contained it: the two
 * shots of this dialog are the people fold and the Ansage row, and this row
 * stands above both of them in the sheet and inside neither photograph.
 *
 * The inner `.stack` and not the sheet, for the section's reason above and one
 * of its own: this block is the whole of the question — the trigger, the end of
 * the rule beside it, the weekdays under it — and it is the element the product
 * hides as a unit, so a shot of it goes red for a change to this row and for
 * nothing else.
 *
 * Two of them, because the row has two shapes and the second is not the first
 * with something added: „einmalig" is one trigger across the whole column, and
 * „wöchentlich" is two controls sharing it with a grid of seven under them. A
 * baseline of either says nothing about the other, and §6.10's argument for
 * `field` — that a column of questions wants one left edge to follow down — is
 * at its plainest in the second, where the two controls of one row share its
 * width instead of a pill stopping after its word beside a full-width date.
 *
 * The date in the second shot is the one thing here that would rot, and it is
 * answered the way this file answers everything: named rather than covered. The
 * rule's „Bis" is the draft's own day plus 55, so the clock is pinned to the
 * seeded Tuesday the way the board shot below pins it, and 2026-10-26 becomes a
 * fact of the seed rather than of the morning the suite ran. Which weekday
 * stands chosen is the same story told shorter — the tile in force is the
 * draft's day, and the pin is what makes it DI.
 *
 * It is the field's *value* that is asserted and not the words standing in it,
 * and the two baselines are why. A `<input type="date">` is written out in the
 * browser's own UI language rather than the page's, which `use.locale` does not
 * reach — so this field reads „26.10.2026" on a German macOS and „10/26/2026"
 * on the Linux runner. One value, two pictures, and each platform compares
 * against its own; the config's note about pinning the locale is about what the
 * product formats, and this is the corner the browser formats instead.
 *
 * ## The other call site, which stays uncovered
 *
 * „Darstellung" in SettingsBody is the same component in the same round, and it
 * gets no baseline here. It is drawn only where the METACOM folder holds two
 * fassungen, and a folder means a real `FileSystemDirectoryHandle` — which a
 * headless Chromium will not grant and no fixture can forge. `panel-symbole`
 * above is that panel with no folder, and the row is not in it. Its own comment
 * in SettingsBody says the `field` conversion was measured against markup
 * injected into the live panel by hand, and that remains the only way anybody
 * sees it. Saying so is the whole of what this suite can do about it.
 */

/** The block „Wiederholen" is in. By the label the trigger is named from, not
    by where it sits: `.stack` is four different things in this dialog, and the
    outer one is the whole form. */
const repeating = (sheet: Locator) => sheet.locator(".stack:has(> .row-of #repeatLabel)");

test("the Wiederholen row in an appointment, einmalig", async ({ page }) => {
  await at(page, "09:00");
  const sheet = await openAppointment(page);
  const repeat = repeating(sheet);
  /* By the question rather than by the answer standing on it — which is what
     the `aria-labelledby` half of the conversion bought, and what the wrapping
     `<label>` it replaced could never have given. e2e/kalender.spec.ts drives
     the same control the same way and says the longer version of why. */
  const trigger = sheet.getByLabel("Wiederholen");
  await expect(trigger).toHaveText("einmalig");
  /* The figure the conversion is about, asserted as a number as well as
     photographed. A failure reading 108 where it wanted 854 names the
     regression; the pixel diff of it is a row that got shorter for reasons
     somebody then has to work out. */
  expect((await trigger.boundingBox())!.width, "the trigger takes the whole column").toBe(854);
  /* Nothing repeats, so there is no rule to end and no day to pick. Both are
     `hidden` rather than unmounted — kalender.css's `[hidden]` is what takes
     them out of the column — so both are asked rather than assumed. */
  await expect(repeat.getByLabel("Bis")).toBeHidden();
  await expect(repeat.locator(".picker__grid")).toBeHidden();
  /* Nothing to settle before the shutter, unlike the shot below: a fresh draft
     opens with its name field focused, and the press that opened the sheet left
     the pointer behind it. */
  await expect(repeat).toHaveScreenshot("termin-wiederholen-einmalig.png");
});

test("the Wiederholen row in an appointment, wöchentlich", async ({ page }) => {
  await at(page, "09:00");
  const sheet = await openAppointment(page);
  const repeat = repeating(sheet);
  const trigger = sheet.getByLabel("Wiederholen");
  /* Pressed rather than set: the menu is the control, and what it leaves
     behind — the answer on the trigger, the second field, the grid — is the
     picture. `menuitemradio` is the role menu.js gives a `checked` item. */
  await trigger.click();
  await sheet.getByRole("menuitemradio", { name: "wöchentlich" }).click();
  await expect(trigger).toHaveText("wöchentlich");
  const until = repeat.getByLabel("Bis");
  /* Half the column each, which is the whole of §6.10's argument drawn: two
     controls of one row sharing its width, where the pill used to stop after
     its word beside a full-width date field. */
  expect((await trigger.boundingBox())!.width, "the trigger, beside the end date").toBe(422);
  expect((await until.boundingBox())!.width, "the end of the rule").toBe(422);
  /* The only date this suite photographs, and it is pinned rather than masked:
     the draft's day plus 55, and the draft's day is the seeded Tuesday. */
  await expect(until).toHaveValue("2026-10-26");
  /* Seven, and the draft's own weekday already in force. Asserted as words for
     HEADINGS' reason: DI moving to MI is a bug about which day a rule starts
     on, and it should say that rather than be two tiles' worth of pixels. */
  await expect(repeat.locator(".picker__item")).toHaveText(["MO", "DI", "MI", "DO", "FR", "SA", "SO"]);
  await expect(repeat.locator('.picker__item[aria-pressed="true"]')).toHaveText("DI");
  /* The pointer, off the tiles. It is where it pressed „wöchentlich", the menu
     closed, and the grid is now drawn under it — which is the Stimme panel's
     story exactly, where a pointer left on a row was a real difference between
     two baselines of the same CSS. */
  await page.mouse.move(0, 0);
  /* And the focus, off the trigger, which is the same argument one step less
     obvious. menu.js hands focus back to whatever opened the menu, and
     `.field:focus` is a white fill and an accent border — so the shot would be
     one focused control beside one at rest, and the fill of a field this
     baseline is here to hold would be the one fill it does not show.

     Worse, whether it draws that way at all is not a fact about the CSS.
     `:focus` paints only where `document.hasFocus()` is true, and a headless
     browser answers that differently depending on what else the run has open:
     driving exactly this flow twice while writing this test gave the resting
     fill once and the focused one the next time. A baseline that turns on that
     is the flake the config's `retries: 0` note refuses to paper over. */
  await trigger.blur();
  await expect(repeat).toHaveScreenshot("termin-wiederholen-woechentlich.png");
});

/* The card the voice is on — the one surface in this suite that is not the
   settings dialog, and it is here because of what its absence cost.
   `.card.saying` was drawn in the day's own colour on a field of that colour
   and nobody could see it from across a room. Nothing went red, because
   nothing looked. A rule whose whole job is to be noticeable is exactly the
   rule that has to be photographed.

   One column rather than the week: the effect is the lit card against a
   neighbour that has stepped back and the five pixels between them, and all
   three are in here. The week around it would add six more columns of nothing
   and one more thing to re-record every time any of them moves.

   The moment and the week are both pinned by the seed, so no date in this shot
   is a function of the day it runs on. */
test("the card the voice is on", async ({ page }) => {
  await at(page, "09:00");
  await openBoard(page, {
    appointments: [
      timed(TUESDAY, "10:00", "11:00", "Schwimmen"),
      timed(TUESDAY, "11:00", "12:00", "Essen"),
      timed(TUESDAY, "13:00", "13:30", "Oma"),
    ],
  });
  const di = column(page, "DI");
  await expect(cards(di)).toHaveCount(3);

  /* Set rather than spoken. The announcement is a voice, a clock and a card
     reader away; what this shot is about is the two classes it ends up
     applying, and driving the whole of it would make the picture depend on
     three things that have their own tests. */
  await page.evaluate(() => {
    document.getElementById("app")?.classList.add("hushed");
    document.querySelectorAll(".day .card")[1]?.classList.add("saying");
  });
  await expect(di.locator(".card.saying")).toBeVisible();
  await expect(di).toHaveScreenshot("karte-spricht.png");
});

/*
 * The foot of the page, and the one legal page that fits in a shot.
 *
 * Both are new surfaces and both are drawn by @lautstark/design — `.footer`,
 * `.footer a` and `.linklike` for the first, the sheet's own head, body and ✕
 * for the second — so a regression in either is a regression in four products
 * at once, which is the same argument `.metacom-panel` is in this file for.
 *
 * What makes them deterministic is what makes everything above deterministic:
 * an empty database. The footer's `credit` follows the symbols the *week*
 * draws, so with nothing planned it is empty and no attribution paragraph is
 * drawn at all — which is §6.12's `{#if}` and the state worth holding, because
 * an empty paragraph above the links would be a row of air. And nothing in
 * either shot is a function of the day it runs on: „Stand: September 2026" is
 * a written date on a page that is not photographed here, and the Impressum
 * has no date in it at all.
 */

test("the foot of the page", async ({ page }) => {
  await page.goto("/kalender/");
  const foot = page.getByRole("contentinfo");
  await expect(foot).toBeVisible();
  /* Asserted rather than left to the pixels, for HEADINGS' reason: a failure
     should say which link went missing rather than hand over a picture of four
     words. The order is the product's and is part of what this holds. */
  await expect(foot.getByRole("button")).toHaveText(["Über Wochenwerk", "Impressum", "Datenschutz"]);
  await expect(foot.getByRole("link")).toHaveText(["Quellcode"]);
  /* No attribution line with an empty week. See above — the absence is a
     consequence of the rule rather than a setting. */
  await expect(foot.locator(".footer__credit")).toHaveCount(0);
  await expect(foot).toHaveScreenshot("seitenfuss.png");
});

test("the Impressum, whole", async ({ page }) => {
  await page.goto("/kalender/");
  await page.getByRole("contentinfo").getByRole("button", { name: "Impressum" }).click();
  const sheet = page.getByRole("dialog", { name: "Impressum" });
  await expect(sheet).toBeVisible();
  /* The shortest of the three and the only one that fits in a viewport, which
     is why it is the one photographed: a shot of a page that scrolls is a shot
     of wherever it happened to be. Two things asserted as words first — the
     heading § 5 DDG names, and that the whole page really is in frame rather
     than cut off at the fold. */
  await expect(sheet.getByRole("heading", { name: "Angaben gemäß § 5 DDG" })).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Streitbeilegung" })).toBeInViewport();
  await expect(sheet).toHaveScreenshot("impressum.png");
});
