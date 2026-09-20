import { owed, pullFromFolder, settleUp, type Waiting } from "./db.js";
import { isStale, isStore, reconnect } from "./folder.js";

/* Coming home has to be enough.
 *
 * The folder lives on the wall device and the laptop that writes into it leaves
 * the house — that is the arrangement, not a fault in it (ADR 002). So the share
 * goes away regularly, and the question was never how to stop that. It was what
 * happens on the way back.
 *
 * What happened was nothing. The package marks the folder unreachable and refuses
 * to write; a write is the only thing that can mark it reachable again, and it
 * refuses that too. So the state was a latch: the share could be mounted again ten
 * minutes later and the open tab stayed deaf until somebody reloaded the page or
 * found the button in a folded-away panel. Three times in three weeks a week was
 * planned into a calendar that was talking to nobody.
 *
 * This is the half-minute that ends that. `reconnect` never prompts — the handle
 * and its permission are both still held — so a timer may do it, and a timer is
 * exactly who should: the household did nothing wrong and should not have to do
 * anything about it. Whether the share is genuinely back is answered by the writes
 * that follow, which is what `settleUp` is: the reaching and the paying are one
 * pass, because a folder that is reachable and still owed records is not yet a
 * folder anybody can plan against.
 *
 * It also watches the three moments a laptop actually comes home — the lid opens,
 * the tab is looked at, the network returns — because half a minute is a long time
 * to stand in front of a screen that is wrong. */

/** Whether the folder is out of reach, and how many records it is owed. */
export type Reach = { away: boolean; waiting: number };

/* `$state.raw`, like the week: replaced whole, never edited in place. */
let state = $state.raw<Reach>({ away: false, waiting: 0 });
/** What to draw: read it while drawing and the drawing follows it. */
export const reaching = (): Reach => state;

/** The last settling that moved something, for whoever says so out loud. */
/* A banner going away says the condition ended and says nothing about what
   happened to the records under it — and a clash is exactly the thing somebody
   has to be told in words, because the outcome is that their version is the one
   that did not survive. `at` is what makes two identical settlings two events. */
export type Settled = { sent: number; clashed: Waiting[]; at: number };
let last = $state.raw<Settled | null>(null);
export const settled = (): Settled | null => last;

/** Half a minute, and the same half minute the folder is polled on. */
const EVERY = 30_000;

/* One pass at a time. The timer and three events all call this, and two passes
   over the same rows would write the same record twice and race on deleting it. */
let looking: Promise<void> | null = null;

/**
 * Reach for the folder, pay what is owed, and say where that leaves us.
 *
 * Safe to call whenever something suggests the world may have changed. Where no
 * folder is the store it settles into the state that says so and does nothing —
 * a household keeping its calendar in this browser alone is owed nothing by
 * anybody.
 */
export function look(after?: (sent: number, clashed: Waiting[]) => void): Promise<void> {
  return (looking ??= pass(after).finally(() => { looking = null; }));
}

async function pass(after?: (sent: number, clashed: Waiting[]) => void): Promise<void> {
  if (!isStore()) return say({ away: false, waiting: 0 });
  if (isStale()) await reconnect().catch(() => null);
  if (!isStale()) {
    const { sent, clashed } = await settleUp().catch(() => ({ sent: 0, clashed: [] as Waiting[] }));
    /* Read back what everybody else did only once ours is in. The other order is
       the bug this whole file is about: `pull` replaces these stores with the
       folder's content, and an unsent edit under it is an edit deleted. */
    if (sent || clashed.length) {
      await pullFromFolder().catch(() => undefined);
      last = { sent, clashed, at: Date.now() };
      after?.(sent, clashed);
    }
  }
  say({ away: isStale(), waiting: await owed().catch(() => 0) });
}

function say(next: Reach): void {
  if (next.away !== state.away || next.waiting !== state.waiting) state = next;
}

/**
 * Keep reaching, for as long as the page is open.
 *
 * Returns the way to stop, which nothing in the product uses: both routes are
 * pages that stay open — one on a wall, one on a laptop somebody plans a week in
 * — and neither has a moment where it would want to stop caring.
 */
export function watchReach(after?: (sent: number, clashed: Waiting[]) => void): () => void {
  const now = () => void look(after);
  const timer = setInterval(now, EVERY);
  /* The lid opening and the tab being looked at are the same event twice on some
     platforms and neither on others, so both are listened for; `look` collapses
     the duplicate. `online` is the one that fires when the wifi comes back while
     the screen was never off. */
  const seen = () => { if (document.visibilityState === "visible") now(); };
  document.addEventListener("visibilitychange", seen);
  addEventListener("focus", now);
  addEventListener("online", now);
  now();
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", seen);
    removeEventListener("focus", now);
    removeEventListener("online", now);
  };
}
