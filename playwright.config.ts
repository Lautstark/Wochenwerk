import { defineConfig, devices } from "@playwright/test";

/* E2E_PORT lets two checkouts run the suite side by side.
 *
 * bildhaft and mitreden both carry a long note about this and both paid for it:
 * with `reuseExistingServer`, a server already answering on the port is not a
 * clash but a silent wrong answer — the suite tests whatever that server is
 * serving, and every failure then points at this repository's own selectors.
 *
 * Which is why this does not default to 3000. 3000 is what `npm run dev` and
 * .claude/launch.json use, so the likely squatter is a *wochenwerk* dev server
 * from a worktree with different CSS in it — and a visual baseline recorded
 * against the wrong working tree is worse than a broken one, because it is
 * green. This is not hypothetical: the first run of this suite found something
 * already answering on the first port tried and started nothing.
 *
 * 4175 continues the family's numbering rather than inventing one — mitreden
 * has 4173, bildhaft 4174 — so no two Lautstark suites collide either.
 * E2E_PORT moves it again where two checkouts of *this* repo run at once.
 *
 * 127.0.0.1 rather than localhost: vite.config.ts binds the dev server to
 * 127.0.0.1, and `localhost` resolves to ::1 first on some machines, where
 * nothing is listening. */
const PORT = Number(process.env.E2E_PORT ?? 4175);
const ORIGIN = `http://127.0.0.1:${PORT}`;

/*
 * Unlike its siblings this suite runs against the *dev* server rather than
 * `vite preview`, and the reason is what the suite is for. These are pixel
 * baselines for a CSS move — product CSS on its way into @lautstark/design —
 * and the loop that move is made in is `npm run dev`. Comparing against a
 * bundle would put a build step between an edit and the answer to "did that
 * change anything", which is the one question these tests exist to answer
 * quickly. The build stays gated by `npm run check` and the Pages workflow.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  /* No retries, here or in CI. A retry is how a flaky screenshot becomes a
     green one, and a visual baseline that passes on the second try is telling
     you nothing on the first. If a shot flickers, the mask is wrong. */
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  /*
   * Baselines are pixels, and pixels belong to the machine that made them: a
   * macOS Chromium and a Linux Chromium disagree on every antialiased edge in
   * the dialog. Playwright already keeps them apart by naming the files
   * `…-chromium-darwin.png`, so a Linux runner does not compare against these —
   * it finds no baseline for its own platform and, without this, writes one and
   * passes, which is a green light that compared nothing.
   *
   * So CI skips the comparison outright and says so. What the CI run still
   * proves is worth having and is most of the spec: the calendar loads, the
   * settings dialog opens, and all four panels unfold with something in them.
   * The pixel gate is local, next to the person moving the CSS, which is where
   * the question is actually asked. To take it up in CI, record a Linux
   * baseline in the Playwright docker image and commit that beside these.
   */
  ignoreSnapshots: !!process.env.CI,

  use: {
    baseURL: ORIGIN,
    trace: "on-first-retry",
    /* Pinned, all three of them. The calendar formats dates and the panels are
       written in German; a runner set to en-US would redraw half the dialog and
       report it as a CSS regression. The theme is the same story — the kalender
       follows the system scheme where nobody has chosen one, so an unpinned
       colour scheme is a light baseline on one machine and a dark one on the
       next. */
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    colorScheme: "light",
  },

  expect: {
    toHaveScreenshot: {
      /* Not zero. Chromium renders the same subpixel edge a shade differently
         between runs of the same binary; a handful of pixels either way is that
         and not a change to the design. Anything a CSS move does to a panel is
         orders of magnitude above this. */
      maxDiffPixels: 40,
    },
  },

  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        /* Written out rather than taken from the device, because the device's
           viewport is Playwright's to change and the dialog is `wide`: its
           width, and therefore every wrap in it, is a function of this number. */
        viewport: { width: 1280, height: 900 },
      },
    },
  ],

  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
