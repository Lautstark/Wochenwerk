import { el, field, fill, input } from "../ui.js";
import { PROVIDER_IDS, pictures, refFor, search, type ProviderId } from "../symbols.js";
import type { SymbolRef } from "../model.js";
import { picture, grid, pickerItem } from "./pieces.js";

/* Searching for a symbol is one widget, built once and used by both the dialogs
   that need it. The field is never replaced — only the results are — which is why
   typing no longer loses the caret. */
export function symbolSearch(onPick: (ref: SymbolRef) => void) {
  let source: ProviderId = "metacom";
  let typing = 0;

  const query = input("search", { attrs: { placeholder: "z. B. Spielplatz", autocomplete: "off" } });
  const where = el("select", { class: "field", on: { change: () => { source = where.value as ProviderId; run(); } } },
    ...PROVIDER_IDS.map(id => el("option", { text: id === "metacom" ? "METACOM" : "ARASAAC", attrs: { value: id } })));
  const results = grid();
  const node = el("div", { class: "search" },
    el("div", { class: "search__row" }, field("Symbol suchen", query), field("Quelle", where)),
    results);

  const run = () => {
    clearTimeout(typing);
    const wanted = query.value.trim();
    if (wanted.length < 2) return fill(results);
    typing = window.setTimeout(async () => {
      const found = (await search(source, wanted).catch(() => [])).slice(0, 18).map(candidate => refFor(source, candidate));
      const known = await pictures(found);
      fill(results, ...found.map(ref => pickerItem(ref.label, picture(ref, ref.label, known), false, () => onPick(ref))));
    }, 250);
  };
  query.addEventListener("input", run);
  return { node, clear: () => { query.value = ""; fill(results); } };
}
