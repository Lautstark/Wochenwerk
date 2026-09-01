import { menuOn } from "@lautstark/design/menu";
import { button, el, input } from "../ui.js";
import { pictureFor } from "../symbols.js";
import { preview } from "../speech.js";
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

/* A preference with a handful of answers is picked the way the family picks
   things: a button that says what is chosen and opens a menu. A native <select>
   was never one of this system's parts — its open list is drawn by the operating
   system and is the one thing on the page that cannot follow the tokens. vorlaut
   says the same in its own rendering chooser; bildhaft is the outlier there. */
export function dropdown(label: () => string, build: (add: (item: string, run: () => void, opts?: { checked?: boolean }) => void) => void) {
  const trigger = el("button", { class: "btn dropdown", attrs: { type: "button" },
    on: { click: () => menuOn(trigger, build) } });
  const node = el("span", { class: "menu-anchor" }, trigger);
  const sync = () => { trigger.textContent = label(); };
  sync();
  return { node, sync };
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

/**
 * The word a record is said with, and a way to hear it before deciding.
 *
 * Empty is the ordinary state and the placeholder is what would be said instead,
 * so the field shows the answer without storing it: a household that is happy
 * with the name types nothing, and `speech` stays the override it is meant to be
 * rather than a second copy of the name to keep in step. See docs/speech.md.
 *
 * Hearing it is the reason this is a component and not two lines in a dialog —
 * choosing a word for a two-year-old without hearing it is choosing blind, and
 * the same trap was already there for the voice itself.
 */
export function speechField(instead: () => string) {
  const box = input("text", { attrs: { autocomplete: "off" } });
  const why = el("p", { class: "hint", attrs: { role: "status" } });
  const play = button("Anhören", "quiet sm", async () => {
    const said = box.value.trim() || instead();
    why.textContent = "";
    if (!said) { why.textContent = "Erst einen Namen eintippen."; return; }
    play.disabled = true;
    play.textContent = "Spricht …";
    const trouble = await preview(said);
    play.disabled = false;
    play.textContent = "Anhören";
    /* Said here rather than handed upwards: both places this sits are panels with
       no status line of their own, and a problem with one word belongs beside
       that word rather than at the far end of a sheet. */
    if (trouble) why.textContent = trouble;
  });
  const node = el("div", { class: "speech" }, el("div", { class: "speech-row" }, box, play), why);
  return {
    node, box,
    /* Called whenever the name it stands in for changes, so the placeholder never
       promises a word the record has since stopped having. */
    draw: () => { box.placeholder = instead() || "Ohne Namen wird nichts gesagt"; },
  };
}
