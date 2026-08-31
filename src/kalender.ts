import "./kalender.css";
import { announcer } from "@lautstark/design/toast";
import { addDays, dayLabel, iso } from "./model.js";
import { el, fill, button } from "./ui.js";
import { load, shown, subscribe } from "./store.js";
import { metacom, restore } from "./symbols.js";
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
const grid = weekGrid(
  appointment => editAppointment(appointment, true, () => void load()),
  (date, start) => editAppointment(blankAppointment(date, start), false, () => void load()),
);

const step = (by: number) => void load(by === 0 ? 0 : shown().offset + by);
fill(app, el("div", { class: "shell" },
  el("header", { class: "topbar" },
    el("div", { class: "topbar__nav" },
      button("‹", "quiet icon", () => step(-1)),
      button("›", "quiet icon", () => step(1)),
      button("Heute", "quiet sm", () => step(0)),
      label),
    el("div", { class: "topbar__nav" },
      el("a", { class: "btn quiet sm", text: "Symbolansicht ↗", attrs: { href: "/", target: "_blank", rel: "noopener" } }),
      button("Einstellungen", "sm", () => openSettings(say)))),
  empty, grid.node, line));

subscribe(current => {
  label.textContent = `${dayLabel(iso(current.monday))} – ${dayLabel(iso(addDays(current.monday, 6)))} ${current.monday.getFullYear()}`;
  empty.hidden = current.appointments.length > 0;
  grid.draw(current);
});
metacom.subscribe(() => void load());

await restore().catch(() => false);
await load(0);
