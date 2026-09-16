<script lang="ts">
  /* A symbol, or its name where the picture is not here. The same tile
     wherever a symbol appears. */
  import { pictureFor } from "../symbols.js";
  import { shown } from "../store.svelte.js";
  import type { SymbolRef } from "../model.js";
  let { symbol, name, known }: { symbol: SymbolRef | undefined; name: string; known?: Map<string, string> } = $props();
  let url = $derived(symbol ? pictureFor(known ?? shown().pictures, symbol) : null);
</script>

<span class="thumb" title={name}>{#if url}<img src={url} alt="" />{:else}<span class="thumb__gap">{name}</span>{/if}</span>
