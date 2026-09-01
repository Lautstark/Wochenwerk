import "./kalender.css";
import { announcer } from "@lautstark/design/toast";
import { addDays, dayLabel, drawnSymbols, iso, weekdays, type SymbolRef } from "./model.js";
import { el, fill, button } from "./ui.js";
import { pullFromFolder, settings } from "./db.js";
import { load, shown, subscribe, type Week } from "./store.js";
import { ablage, watchFolder } from "./folder.js";
import { metacom, owed, preferRendering, restore } from "./symbols.js";
import { weekGrid } from "./views/week-grid.js";
import { blankAppointment, editAppointment } from "./views/appointment-dialog.js";
import { openSettings } from "./views/settings-dialog.js";

/* The route, and only the route: what is on screen comes from the store, what is
   drawn comes from the views, and what is kept comes from the database. */

const app = document.querySelector<HTMLElement>("#app")!;
const line = el("p", { class: "line", attrs: { role: "status" } });
const talk = announcer(line, { rest: 4000, onRest: node => { node.textContent = ""; } });
const say = (text: string) => { talk.say(text); };

const label = el("b");
const empty = el("p", { class: "notice", text: "Noch nichts geplant. Klick in eine Spalte, um einen Termin anzulegen." });
/* ARASAAC's licence is a condition on showing its pictures, so the notice is asked
   of the symbols this week draws — not of the collection the household happens to
   be searching in. A week drawn from the household's own METACOM folder owes
   nothing and leaves the line empty. */
const credit = el("p", { class: "credit" });
const drawn = (current: Week): SymbolRef[] => [
  ...current.appointments.flatMap(appointment => appointment.symbols),
  ...current.appointments.flatMap(item => drawnSymbols(item, current.cards)),
];
const grid = weekGrid(
  appointment => editAppointment(appointment, true, () => void load()),
  (date, start) => editAppointment(blankAppointment(date, start), false, () => void load()),
);

/* A phone has no room for seven columns, so it shows the day being looked at and
   the arrows walk days instead of weeks — across a week boundary when they run
   off the end. */
const narrow = matchMedia("(max-width: 700px)");
let day = (new Date().getDay() + 6) % 7;

function apply() {
  grid.show(narrow.matches ? [shown().dates[day]] : null);
  grid.draw(shown());
  label.textContent = narrow.matches
    ? `${weekdays[day]} ${dayLabel(shown().dates[day])}`
    : `${dayLabel(iso(shown().monday))} – ${dayLabel(iso(addDays(shown().monday, 6)))} ${shown().monday.getFullYear()}`;
}
async function step(by: number) {
  if (by === 0) { day = (new Date().getDay() + 6) % 7; await load(0); return; }
  if (!narrow.matches) return void load(shown().offset + by);
  const next = day + by;
  if (next < 0 || next > 6) { day = next < 0 ? 6 : 0; await load(shown().offset + by); return; }
  day = next;
  apply();
}
narrow.addEventListener("change", apply);
fill(app, el("div", { class: "shell" },
  el("header", { class: "topbar" },
    el("div", { class: "topbar__nav" },
      button("‹", "quiet icon", () => void step(-1)),
      button("›", "quiet icon", () => void step(1)),
      button("Heute", "quiet sm", () => void step(0)),
      label),
    el("div", { class: "topbar__nav" },
      el("a", { class: "btn quiet sm", text: "Symbolansicht ↗", attrs: { href: import.meta.env.BASE_URL, target: "_blank", rel: "noopener" } }),
      button("Einstellungen", "sm", () => openSettings(say)))),
  empty, grid.node, el("footer", { class: "foot" }, line, credit)));

subscribe(current => {
  empty.hidden = current.appointments.length > 0;
  credit.textContent = owed(drawn(current)).join(" ");
  apply();
});
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
/* Somebody else's edit, arriving as a file that changed under this browser. */
watchFolder(() => void pullFromFolder().then(() => load()));
