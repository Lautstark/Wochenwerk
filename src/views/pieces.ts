import { menuOn } from "@lautstark/design/menu";
import { button, el, fill, input } from "../ui.js";
import { pictureFor } from "../symbols.js";
import { preview } from "../speech.js";
import { couldSay, fromPeople, type Shape } from "../announce.js";
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
export function speechField(instead: () => string, shape: () => Shape = () => ({})) {
  const box = input("text", { attrs: { autocomplete: "off" } });
  const why = el("p", { class: "hint", attrs: { role: "status" } });
  const word = () => box.value.trim() || instead();

  const play = (text: string, node: HTMLButtonElement, label: string) => async () => {
    why.textContent = "";
    node.disabled = true;
    const was = node.textContent;
    node.textContent = "…";
    const trouble = await preview(text);
    node.disabled = false;
    node.textContent = was ?? label;
    /* Said here rather than handed upwards: both places this sits are panels with
       no status line of their own, and a problem with one word belongs beside
       that word rather than at the far end of a sheet. */
    if (trouble) why.textContent = trouble;
  };

  const hear = button("Anhören", "quiet sm", () => {
    const said = word();
    if (!said) { why.textContent = "Erst einen Namen eintippen."; return; }
    void play(said, hear, "Anhören")();
  });

  /* Every sentence the word can turn up in, closed by default: six of them under
     each dialog would be more surface than the form they belong to. Absent
     entirely until there is a word, because a list of frames with a hole in each
     one answers nothing. */
  const lines = el("div", { class: "sentences" });
  const all = el("details", { class: "sentences__fold" }, el("summary", {}), lines);

  /* Called whenever the name it stands in for changes, and whenever this field is
     typed in — the second is the one that was missing, so the list went on
     showing sentences built from the title while somebody typed the word that
     replaces it. What is written here is what the board will say, so it is what
     the list has to be made of. */
  function draw() {
      /* A birthday and a visit are said from the person on the record, and
         `dayClause` asks about people before it asks about a name — so a word
         typed here would be written and never spoken. The field says that
         instead of inviting one. */
      const own = fromPeople(shape());
      box.disabled = own;
      box.placeholder = own ? "Wird von der Person gesagt" : instead() || "Ohne Namen wird nichts gesagt";
      const possible = couldSay(own ? "" : word(), shape());
      all.hidden = !possible.length;
      all.querySelector("summary")!.textContent = own
        ? `Was an diesem Tag gesagt wird (${possible.length})`
        : `Alle Sätze mit diesem Wort (${possible.length})`;
      fill(lines, ...possible.map(line => {
        /* `quiet icon sm` is the family's own icon-only button — pill radius,
           its own padding, line-height 1. A local class here fought `sm`'s
           padding and produced a hover fill wider than the glyph. */
        const one = button("▶", "quiet icon sm", () => {});
        one.setAttribute("aria-label", "Satz anhören");
        one.addEventListener("click", () => void play(line.text, one, "▶")());
        return el("div", { class: "sentence" }, one,
          el("span", { class: "sentence__text", text: line.text }),
          el("span", { class: "sentence__when", text: line.when }));
      }));
  }
  box.addEventListener("input", draw);

  return {
    node: el("div", { class: "speech" }, el("div", { class: "speech-row" }, box, hear), why, all),
    box, draw,
  };
}
