import "./kalender.css";
import { initTheme } from "@lautstark/design/theme";
import { mount } from "svelte";
import { pullFromFolder, settings } from "./db.js";
import { load } from "./store.svelte.js";
import { ablage, adopted, watchFolder } from "./folder.js";
import { watchReach } from "./reaching.svelte.js";
import { metacom, preferRendering, restore } from "./symbols.js";
import Kalender from "./kalender/Kalender.svelte";

/* The boot, and only the boot: the page is kalender/Kalender.svelte, what it shows
   comes from the store, and what is kept comes from the database. */

/* The half of the scheme that a picker inside a settings sheet cannot do, and
   which nothing here was doing.
 *
 * kalender/index.html already carries the stored-choice read inline, ahead of the
 * bundle, so the tokens are right on the first paint — that half was never
 * missing. What was missing is this call: it subscribes to the operating system
 * changing its mind while „Wie das Gerät" is in force, and it writes the
 * `theme-color` meta the browser chrome reads, which this page had none of. Both
 * are entry-point work; `@lautstark/design/svelte/ThemePicker` says so in as many
 * words, and the calendar's Aussehen panel is that picker now.
 *
 * The calendar entry only. `src/main.ts` next door must not gain this: the board
 * is a display on a wall, style.css commits it to dark, and a chrome colour
 * following a laptop's preference is not a thing a wall has. Its own index.html
 * has no boot snippet for the same reason and carries a comment saying so. */
initTheme("wochenwerk.theme");

mount(Kalender, { target: document.querySelector<HTMLElement>("#app")! });
metacom.subscribe(() => void load());

await restore().catch(() => false);
/* Where a folder is the store, it is read before anything is drawn, and watched
   afterwards: another household member editing on another machine is the reason
   a folder was chosen at all. */
await ablage.restore().catch(() => null);
await pullFromFolder().catch(() => undefined);
/* The package holds the rendering preference for the tab and persists nothing, so
   the household's answer is handed to it once the folder is back. */
preferRendering((await settings()).metacomRendering ?? null);
await load(0);
/* Somebody else's edit, arriving as a file that changed under this browser. Only
   once the folder is the store: a folder mid-adoption changes constantly, and all
   of those changes are ours. */
if (await adopted()) watchFolder(() => void pullFromFolder().then(() => load()));
/* And the other direction: a folder this browser has gone out of reach of, and the
   records it is owed once it is back. It runs whether or not the folder is adopted
   — being out of reach is exactly the state in which that question cannot be
   asked — and redraws the week when something of ours has landed. */
watchReach(() => void load());
