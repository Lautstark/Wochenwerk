/* The one loop that follows the wall clock.

   On every minute boundary rather than on an interval, so a page never drifts
   away from the clock and a kiosk woken from sleep catches up at the next
   boundary instead of a minute after it.

   It used to be the board's `tick()`, which drew and then set its own next
   timeout — and was also what a remote edit and a settled folder called to
   redraw. Each of those calls started a second loop beside the first, for good:
   a board that hangs on a wall for months collected one more redraw per minute
   for every edit made on the laptop. And a draw that threw ended the loop it was
   in, so a single bad read stopped the clock on the wall. So the loop is this,
   and only this starts one; a redraw outside it is a redraw and nothing more.

   The next boundary is worked out after `run` has finished, not before it
   started, so a slow draw cannot land two runs in one minute. */
export function everyMinute(run: () => unknown): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const once = async () => {
    try {
      await run();
    } catch (error) {
      /* Said, not swallowed — and not allowed to end the loop either: the next
         minute is a fresh read, and usually a good one. */
      console.error("Wochenwerk: the minute's redraw failed", error);
    } finally {
      if (!stopped) timer = setTimeout(() => void once(), untilNextMinute(new Date()));
    }
  };
  void once();
  return () => { stopped = true; clearTimeout(timer); };
}

/* Twenty milliseconds past the boundary, so that a timer that fires a hair early
   still reads the new minute rather than the old one. */
export const untilNextMinute = (at: Date) => 60_000 - (at.getSeconds() * 1000 + at.getMilliseconds()) + 20;
