<script lang="ts">
  /* Searching for a symbol is one widget, used by both the sheets that need it.
     The field is never replaced — only the results are — which is why typing
     does not lose the caret.

     There is no source to pick here. Which collection a household draws from follows
     from whether it has connected a METACOM folder, and that is a fact about the
     household rather than about the symbol being looked for. It is answered once,
     in Einstellungen → Symbole, by connecting a folder or not. */
  import { owed, pictures, refFor, search, sourceInUse } from "../symbols.js";
  import type { SymbolRef } from "../model.js";
  import Tile from "@lautstark/design/svelte/Tile";
  import TileGrid from "@lautstark/design/svelte/TileGrid";
  import Picture from "./Picture.svelte";

  let { onpick, hidden = false }: { onpick: (ref: SymbolRef) => void; hidden?: boolean } = $props();
  let query = $state("");
  let found = $state<SymbolRef[]>([]);
  let known = $state.raw(new Map<string, string>());
  let credit = $derived(owed(found).join(" "));
  let field: HTMLInputElement;
  let typing = 0;

  const wipe = () => { found = []; };
  function run() {
    clearTimeout(typing);
    const wanted = query.trim();
    if (wanted.length < 2) return wipe();
    typing = window.setTimeout(async () => {
      const source = sourceInUse();
      const hits = (await search(source, wanted).catch(() => [])).slice(0, 18).map(candidate => refFor(source, candidate));
      known = await pictures(hits);
      found = hits;
    }, 250);
  }
  export const clear = () => { query = ""; wipe(); };
  /* The empty slot points here, so it needs somewhere to point. */
  export const focus = () => field.focus();
</script>

<div class="search" {hidden}><div class="search__row"><label class="field-row"><span class="lbl">Symbol suchen</span><input bind:this={field} class="field" type="search" placeholder="z. B. Spielplatz" autocomplete="off" bind:value={query} oninput={run} /></label></div><TileGrid>{#each found as ref}<Tile label={ref.label} toggle active={false} onclick={() => onpick(ref)}><Picture symbol={ref} name={ref.label} {known} /></Tile>{/each}</TileGrid><p class="small muted">{credit}</p></div>
