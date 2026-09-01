import { el, field, fill, input } from "../ui.js";
import { owed, pictures, refFor, search, sourceInUse } from "../symbols.js";
import type { SymbolRef } from "../model.js";
import { picture, grid, pickerItem } from "./pieces.js";

/* Searching for a symbol is one widget, built once and used by both the dialogs
   that need it. The field is never replaced — only the results are — which is why
   typing no longer loses the caret.

   There is no source to pick here. Which collection a household draws from follows
   from whether it has connected a METACOM folder, and that is a fact about the
   household rather than about the symbol being looked for — asking it again beside
   every query made it a per-item choice that was thrown away when the dialog
   closed. It is answered once, in Einstellungen → Symbole, by connecting a folder
   or not. */
export function symbolSearch(onPick: (ref: SymbolRef) => void) {
  let typing = 0;

  const query = input("search", { attrs: { placeholder: "z. B. Spielplatz", autocomplete: "off" } });
  const results = grid();
  /* ARASAAC's licence is a condition, not a courtesy: its notice belongs wherever
     its pictures are, and these results are the first place they appear. The words
     are the package's own, and METACOM — the household's own licensed folder — owes
     none, so this line is simply empty then. */
  const credit = el("p", { class: "small muted" });
  const node = el("div", { class: "search" },
    el("div", { class: "search__row" }, field("Symbol suchen", query)),
    results, credit);

  const wipe = () => { fill(results); credit.textContent = ""; };
  const run = () => {
    clearTimeout(typing);
    const wanted = query.value.trim();
    if (wanted.length < 2) return wipe();
    typing = window.setTimeout(async () => {
      const source = sourceInUse();
      const found = (await search(source, wanted).catch(() => [])).slice(0, 18).map(candidate => refFor(source, candidate));
      const known = await pictures(found);
      fill(results, ...found.map(ref => pickerItem(ref.label, picture(ref, ref.label, known), false, () => onPick(ref))));
      credit.textContent = owed(found).join(" ");
    }, 250);
  };
  query.addEventListener("input", run);
  /* The empty slot points here, so it needs somewhere to point. */
  return { node, clear: () => { query.value = ""; wipe(); }, focus: () => query.focus() };
}
