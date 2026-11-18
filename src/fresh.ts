/* A new version, picked up by the wall on its own.

   The board is a page that is loaded once and then hangs there for days, and
   GitHub Pages hands out a new version only to whoever asks again. On 2026-11-18
   that left the wall three and a half days behind a deploy: the calendar wrote
   appointments with the household's own photos, the board's older code had
   never heard of a photo, and the tiles stood empty until somebody pressed F5
   over ssh. Nobody in the room presses F5.

   So the board asks. Every few minutes it fetches its own page, past every
   cache, and reads which bundle that page would load. Vite names the bundle
   after its contents, so a different name is a different version and the same
   name is the same one — no version file to keep in step with anything. Where
   it differs, the page reloads, but only into a quiet moment: not while the
   voice is speaking, not while a card has just been laid or taken back, and
   not while a question stands open over the slot. Until then it asks again
   every half minute.

   An unreachable server is no news. The wall boots faster than its WLAN and
   the watchdog in index.html is what deals with a page that never arrived;
   this only ever acts on an answer. */

/** The bundle a page loads: the `src` of its module script. */
export function entryOf(html: string): string | null {
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype=["']?module["']?/i.test(tag)) continue;
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (src) return src;
  }
  return null;
}

export type Watch = {
  /** The bundle this page is running. */
  running: string | null;
  /** Whether nothing is happening that a reload would cut off. */
  quiet: () => boolean;
  fetchPage?: () => Promise<string | null>;
  reload?: () => void;
  every?: number;
  retry?: number;
  later?: (run: () => void, ms: number) => unknown;
};

/** One look: reloads and answers true where the page names a different bundle
    and the moment is quiet; "waiting" where it differs and the moment is not. */
export async function look(watch: Required<Pick<Watch, "fetchPage" | "reload">> & Watch): Promise<"same" | "waiting" | "reloaded"> {
  if (!watch.running) return "same";
  const html = await watch.fetchPage().catch(() => null);
  const deployed = html ? entryOf(html) : null;
  if (!deployed || deployed === watch.running) return "same";
  if (!watch.quiet()) return "waiting";
  watch.reload();
  return "reloaded";
}

export function watchVersion(watch: Watch): void {
  const full = {
    fetchPage: async () => {
      const answer = await fetch(location.href, { cache: "no-store" });
      return answer.ok ? answer.text() : null;
    },
    reload: () => location.reload(),
    every: 10 * 60_000,
    retry: 30_000,
    later: (run: () => void, ms: number) => setTimeout(run, ms),
    ...watch,
  };
  const again = async () => {
    const seen = await look(full);
    if (seen !== "reloaded") full.later(() => void again(), seen === "waiting" ? full.retry : full.every);
  };
  full.later(() => void again(), full.every);
}
