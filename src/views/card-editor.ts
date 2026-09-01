import { button, el, field, fill, input, spacer } from "../ui.js";
import { TONES, toneOf, type Card, type SymbolRef } from "../model.js";
import { putCard } from "../db.js";
import { prepare } from "../speech.js";
import { pictures } from "../symbols.js";
import { picture, speechField } from "./pieces.js";
import { symbolSearch } from "./symbol-search.js";

/* A card is a household object: a laminated picture with a tag on it, laid out
   when a choice is offered. It always has a symbol — the picture is the point of
   the card — so the symbol is one slot that a new pick overwrites, never
   something to empty out.

   It is a panel and not a dialog, and that is the whole of what changed. Both
   places a card is edited from are already sheets — the Wahl side of the
   appointment editor, and the Karten panel in the settings — so a dialog here was
   never anything but a dialog on top of a dialog: a second scrim, a second Escape,
   a second thing to close in the right order, over a surface that had the room all
   along. vorlaut removed the same modal for the same reason and kept the seam; what
   is left here is a node the caller puts where it is standing.

   `done` is called with the card's id when it was saved and with null when it was
   not, so a caller that wanted a new card for something can tell the two apart
   without asking the database what happened. */
export function cardEditor(card: Card, done: (id: string | null) => void): HTMLElement {
  const draft: Card = structuredClone(card);

  const name = input("text", { attrs: { placeholder: "z. B. Spielplatz", autocomplete: "off" } });
  const nfc = input("text", { attrs: { placeholder: "04A1B2C3", autocomplete: "off" } });
  name.value = draft.name;
  nfc.value = draft.nfc ?? "";
  /* What the board says when this card is offered or named. Empty means the name
     itself, which is the ordinary case — the field is here for where the written
     and the spoken word come apart. docs/speech.md. */
  const speech = speechField(() => name.value.trim() || draft.name, () => ({ offered: true, picked: true }));
  speech.box.value = draft.speech ?? "";

  const slot = el("div", { class: "slot" });
  const tones = el("div", { class: "tones" });
  const search = symbolSearch(ref => {
    draft.symbol = ref;
    if (!name.value.trim()) name.value = ref.label;
    search.clear();
    void sync();
  });

  const save = button("Sichern", "primary sm", () => void store());
  const heading = el("b", { class: "editor__name" });
  /* The actions ride in the heading rather than under the form. What is under the
     form is the symbol search, which fills with results and is as tall as the panel
     lets it be — a Sichern below that is a scroll away from the thing it saves. */
  const node = el("div", { class: "editor" },
    el("div", { class: "editor__head" }, heading, spacer(),
      button("Abbrechen", "quiet sm", () => done(null)), save),
    el("div", { class: "stack" },
      field("Name", name), field("Ansage", speech.node), field("NFC-Nummer", nfc),
      el("span", { class: "lbl", text: "Farbe" }), tones,
      el("span", { class: "lbl", text: "Symbol" }), slot,
      search.node));

  async function sync() {
    heading.textContent = name.value.trim() || draft.name || "Neue Karte";
    /* The picture has to be resolved for the symbol this card holds: the week's
       map only knows what was already on screen, and a fresh pick is not. */
    const known = draft.symbol ? await pictures([draft.symbol]) : new Map<string, string>();
    fill(slot, draft.symbol
      ? el("div", { class: "slot__filled" }, picture(draft.symbol, draft.symbol.label, known),
          el("span", { class: "small", text: draft.symbol.label }))
      : el("p", { class: "empty", text: "Such unten ein Symbol aus." }));
    fill(tones, ...TONES.map(tone => el("button", {
      class: `swatch${toneOf(draft) === tone ? " swatch--active" : ""}`,
      style: { "--tone": tone }, attrs: { type: "button", "aria-label": "Farbe" },
      on: { click: () => { draft.tone = tone; void sync(); } },
    })));
    speech.draw();
    save.disabled = !draft.symbol;
  }

  const store = async () => {
    draft.name = name.value.trim();
    if (!draft.name) return name.focus();
    if (!draft.symbol) return;
    draft.speech = speech.box.value.trim() || undefined;
    /* See the appointment editor: prepared while somebody is saving, not while a
       child is waiting. */
    void prepare(speech.sentences());
    draft.nfc = nfc.value.trim().toUpperCase() || undefined;
    draft.tone ??= TONES[0];
    await putCard(draft);
    done(draft.id);
  };
  /* Only the heading follows the name, and only the heading is refilled for it —
     `sync` never replaces the field somebody is typing in. */
  name.addEventListener("input", () => {
    heading.textContent = name.value.trim() || "Neue Karte";
    speech.draw();
  });
  void sync();
  return node;
}
export type { SymbolRef };
