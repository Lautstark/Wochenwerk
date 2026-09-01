import { menuOn } from "@lautstark/design/menu";
import { el } from "../ui.js";
import { pictureFor } from "../symbols.js";
import { type Card, type Person, type SymbolRef } from "../model.js";
import { shown } from "../store.js";

/* The pieces both dialogs and the grid are made of, so a symbol, a face and a
   thing-you-can-pick each look the same wherever they appear. */

export function picture(symbol: SymbolRef | undefined, name: string, known = shown().pictures) {
  const url = symbol ? pictureFor(known, symbol) : null;
  return el("span", { class: "thumb", attrs: { title: name } },
    url ? el("img", { attrs: { src: url, alt: "" } }) : el("span", { class: "thumb__gap", text: name }));
}

export function face(person: Person | undefined, size: "" | "sm" = "") {
  if (!person) return null;
  return el("span", { class: `face ${size}`.trim(), style: { "--tone": person.tone }, attrs: { title: person.name } },
    person.photo ? el("img", { attrs: { src: person.photo, alt: "" } }) : el("b", { text: person.initials }));
}

/** One thing that can be picked. Square, because what is picked usually is. */
export function pickerItem(label: string, thumb: Node, active: boolean, onClick: () => void) {
  return el("button", {
    class: `picker__item${active ? " picker__item--active" : ""}`,
    attrs: { type: "button", title: label, "aria-pressed": active },
    on: { click: onClick },
  }, thumb, el("span", { class: "small", text: label }));
}

export const grid = (...items: (Node | null)[]) => el("div", { class: "picker__grid" }, ...items);

/** A row in a list: what it is, what it is set to, and what can be done with it.
    The actions sit in a `.menu-anchor`, which is where `menuOn` puts the menu and
    what its click-outside guard looks for — without it a menu closes on the click
    that opened it. */
export function row(lead: Node | null, title: string, state: string | Node, actions: HTMLElement) {
  return el("div", { class: "row row--line" },
    lead,
    el("span", { class: "row__title", text: title }),
    typeof state === "string" ? el("span", { class: "row__state small muted", text: state }) : state,
    el("div", { class: "row__actions menu-anchor" }, actions));
}

/* `menuOn` opens a menu; it does not register one. Calling it while building a
   row opened a menu and the next click closed it again, which looked exactly
   like a menu that does not work. */
export function overflow(build: (add: (label: string, run: () => void, opts?: { danger?: boolean }) => void) => void) {
  const trigger = el("button", { class: "btn icon quiet", text: "⋯",
    attrs: { type: "button", "aria-label": "Mehr" },
    on: { click: () => menuOn(trigger, build) } });
  return trigger;
}

export const cardThumb = (card: Card | undefined, known = shown().pictures) =>
  picture(card?.symbol, card?.name ?? "?", known);
