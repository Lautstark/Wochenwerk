import { openDialog } from "@lautstark/design/dialog";
import { button, el, field, fill, input, spacer } from "../ui.js";
import { TONES, toneOf, type Card, type SymbolRef } from "../model.js";
import { putCard } from "../db.js";
import { pictures } from "../symbols.js";
import { picture } from "./pieces.js";
import { symbolSearch } from "./symbol-search.js";

/* A card is a household object: a laminated picture with a tag on it, laid out
   when a choice is offered. It always has a symbol — the picture is the point of
   the card — so the symbol is one slot that a new pick overwrites, never
   something to empty out. */
export function editCard(card: Card, after: (id: string) => void) {
  const draft: Card = structuredClone(card);

  const name = input("text", { attrs: { placeholder: "z. B. Spielplatz", autocomplete: "off" } });
  const nfc = input("text", { attrs: { placeholder: "04A1B2C3", autocomplete: "off" } });
  name.value = draft.name;
  nfc.value = draft.nfc ?? "";

  const slot = el("div", { class: "slot" });
  const tones = el("div", { class: "tones" });
  const search = symbolSearch(ref => {
    draft.symbol = ref;
    if (!name.value.trim()) name.value = ref.label;
    search.clear();
    void sync();
  });

  const save = button("Sichern", "primary", () => void store());
  const handle = openDialog({
    title: draft.name || "Neue Karte", closeLabel: "Schließen",
    body: [el("div", { class: "stack" },
      field("Name", name), field("NFC-Nummer", nfc),
      el("span", { class: "lbl", text: "Farbe" }), tones,
      el("span", { class: "lbl", text: "Symbol" }), slot,
      search.node)],
    footer: [spacer(), button("Abbrechen", "quiet", () => handle.close()), save],
  });

  async function sync() {
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
    save.disabled = !draft.symbol;
  }

  const store = async () => {
    draft.name = name.value.trim();
    if (!draft.name) return name.focus();
    if (!draft.symbol) return;
    draft.nfc = nfc.value.trim().toUpperCase() || undefined;
    draft.tone ??= TONES[0];
    await putCard(draft);
    handle.close();
    after(draft.id);
  };
  void sync();
}
export type { SymbolRef };
