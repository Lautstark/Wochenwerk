import { openDialog } from "@lautstark/design/dialog";
import { button, el, field, fill, input, spacer } from "../ui.js";
import { TONES, toneOf, type Card, type SymbolRef } from "../model.js";
import { putCard } from "../db.js";
import { picture } from "./pieces.js";
import { symbolSearch } from "./symbol-search.js";

/* A card is a household object: a laminated picture with a tag on it, laid out
   when a choice is offered. Everything it needs is here, and nothing else is. */
export function editCard(card: Card, after: (id: string) => void) {
  const draft: Card = structuredClone(card);

  const name = input("text", { attrs: { placeholder: "z. B. Spielplatz", autocomplete: "off" } });
  const speech = input("text", { attrs: { placeholder: "Wir gehen auf den Spielplatz.", autocomplete: "off" } });
  const nfc = input("text", { attrs: { placeholder: "04A1B2C3", autocomplete: "off" } });
  name.value = draft.name;
  speech.value = draft.speech ?? "";
  nfc.value = draft.nfc ?? "";

  const chosen = el("div", { class: "chosen" });
  const tones = el("div", { class: "tones" });
  const search = symbolSearch(ref => { draft.symbol = ref; if (!name.value) name.value = ref.label; search.clear(); sync(); });

  const sync = () => {
    fill(chosen, draft.symbol
      ? el("button", { class: "picker__item picker__item--active", attrs: { type: "button" },
          on: { click: () => { draft.symbol = undefined; sync(); } } },
          picture(draft.symbol, draft.symbol.label), el("span", { class: "small", text: "entfernen" }))
      : el("p", { class: "empty", text: "noch kein Symbol" }));
    fill(tones, ...TONES.map(tone => el("button", {
      class: `swatch${toneOf(draft) === tone ? " swatch--active" : ""}`,
      style: { "--tone": tone }, attrs: { type: "button", "aria-label": "Farbe" },
      on: { click: () => { draft.tone = tone; sync(); } },
    })));
  };

  const handle = openDialog({
    title: draft.name || "Neue Karte", closeLabel: "Schließen",
    body: [el("div", { class: "stack" },
      field("Name", name), field("Ansage", speech), field("NFC-Nummer", nfc),
      el("span", { class: "lbl", text: "Farbe" }), tones,
      chosen, search.node)],
    footer: [spacer(), button("Abbrechen", "quiet", () => handle.close()), button("Sichern", "primary", () => void save())],
  });

  const save = async () => {
    draft.name = name.value.trim();
    if (!draft.name) return name.focus();
    draft.speech = speech.value.trim() || undefined;
    draft.nfc = nfc.value.trim().toUpperCase() || undefined;
    draft.tone ??= TONES[0];
    await putCard(draft);
    handle.close();
    after(draft.id);
  };
  sync();
}
export type { SymbolRef };
