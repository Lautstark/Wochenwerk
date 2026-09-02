/* The screen the board is on.
 *
 * On the wall this file has nothing to do: the Wyse starts Chromium in `--kiosk`,
 * so the week already has the whole screen and there is no chrome to be rid of.
 * This is for trying the board out before that frame exists — a browser window
 * with an address bar sitting over the week — and it is asked for by whoever is
 * doing the trying, never by the child.
 *
 * So the door is a key, and the key carries modifiers. The board's own key is the
 * announcement's Space, and that handler leaves anything modified alone on the
 * grounds that a modifier means somebody is at a real keyboard doing something
 * else. This is that somebody. A bare letter would also be standing in the way of
 * whatever unmodified key the board binds next — ADR 002 keeps a key as one of the
 * things that may name an option, beside a card and a tap. */
addEventListener("keydown", event => {
  if (event.code !== "KeyF" || !event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey || event.repeat) return;
  event.preventDefault();
  /* The same keys give the screen back, and so does Esc, which the browser owns
     and no page can take away. A browser that refuses simply stays as it was;
     there is nothing to say about it on a board a child is looking at. */
  void (document.fullscreenElement
    ? document.exitFullscreen().catch(() => {})
    : document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {}));
});

/* A board that goes dark is not a board. The screen is held awake only while the
   week has the whole of it: in a window among other windows the board is being
   worked on rather than hung up, and it has no business keeping that machine
   from sleeping. On the Wyse the question never reaches the browser — blanking
   is turned off in the system there. */
let awake: WakeLockSentinel | null = null, asking = false;
async function stayAwake(): Promise<void> {
  if (asking || awake || !document.fullscreenElement || document.visibilityState !== "visible") return;
  asking = true;
  awake = (await navigator.wakeLock?.request("screen").catch(() => null)) ?? null;
  asking = false;
  /* The browser drops the lock by itself whenever the page stops being visible,
     which is why the sentinel is asked rather than assumed. */
  awake?.addEventListener("release", () => { awake = null; });
}
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) return void stayAwake();
  void awake?.release().catch(() => {});
  awake = null;
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void stayAwake(); });
