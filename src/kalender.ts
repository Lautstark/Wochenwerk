import "./kalender.css";
import { mount } from "svelte";
import { pullFromFolder, settings } from "./db.js";
import { load } from "./store.svelte.js";
import { ablage, adopted, watchFolder } from "./folder.js";
import { metacom, preferRendering, restore } from "./symbols.js";
import Kalender from "./kalender/Kalender.svelte";

/* The boot, and only the boot: the page is kalender/Kalender.svelte, what it shows
   comes from the store, and what is kept comes from the database. */

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
