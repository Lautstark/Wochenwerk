import "./style.css";
/* Vollbild and staying lit: the screen the week is on, which is not the week. */
import "./screen.js";
import { mount } from "svelte";
import { pullFromFolder, settings, whenStuck } from "./db.js";
import { ablage, adopted, watchFolder } from "./folder.js";
import { preferRendering, restore } from "./symbols.js";
import { listen } from "./reader.js";
import Board from "./board/Board.svelte";
import { draw, pressed, reads, tick, trouble, view, wire } from "./board/board.svelte.js";

/* The board's own file is board/Board.svelte, and what it holds between draws is
   board/board.svelte.ts. This is the boot: the page, the doors input comes
   through, and the order the stores are read in. */

const app = document.querySelector<HTMLElement>("#app")!;
mount(Board, { target: app });

wire(app);

whenStuck(trouble);

/* The reader's door, and it carries two facts rather than one, because they fail
   apart: which card is lying there, and whether there is a reader at all. A tag
   that is gone and a reader that is gone look identical from here and mean opposite
   things — one is an answer taken back, the other is a machine to fix while every
   answer stays exactly as it was.

   `karte` is the UID, or `null` for no card. `leser` is whether the reader is
   answering. Debouncing belongs on the other side of this door, where the polling
   is: a single missed read must never arrive here as a removal. */
addEventListener("karte", event => { void reads((event as CustomEvent<string | null>).detail ?? null); });
addEventListener("leser", event => {
  view.readerGone = !(event as CustomEvent<boolean>).detail;
  void draw(new Date());
});

addEventListener("keydown", pressed);

await restore().catch(() => false);
/* Where a folder is the store, it is read before anything is drawn, and watched
   afterwards: another household member editing on another machine is the reason
   a folder was chosen at all. */
await ablage.restore().catch(() => null);
await pullFromFolder().catch(() => undefined);
/* The board resolves references rather than searching, but a reference whose
   qualified path no longer matches is looked up by name — and that lookup answers
   in index order unless it is told which fassung was meant. See `urlFor`. */
preferRendering((await settings()).metacomRendering ?? null);
void tick();
/* Und der Leser, falls auf dieser Maschine eine Brücke läuft. */
listen();
/* Somebody else's edit, arriving as a file that changed under this browser. */
if (await adopted()) watchFolder(() => void pullFromFolder().then(tick));
