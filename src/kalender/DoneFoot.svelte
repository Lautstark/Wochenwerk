<script lang="ts">
  /* A sheet with nothing to confirm: the one button says it is done, and the
     spacer keeps it at the far end, where every other sheet's primary stands. */
  import type { Handle } from "./sheet.svelte.js";
  let { handle, label = "Fertig" }: { s: unknown; handle: Handle; label?: string } = $props();
</script>

<span class="spacer"></span><button class="btn primary" type="button" onclick={() => handle.close()}>{label}</button>
