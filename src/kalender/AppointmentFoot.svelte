<script lang="ts">
  import type { Editing } from "./appointment.svelte.js";
  import type { Handle } from "@lautstark/design/svelte/sheet";
  let { s, handle }: { s: Editing; handle: Handle } = $props();
</script>

{#if s.existing}<button class="btn destructive" type="button" disabled={s.erasing} aria-busy={s.erasing} onclick={() => void s.erase()}>{s.erasing ? "Wird gelöscht …" : "Löschen"}</button>{:else}<span></span>{/if}<span class="spacer"></span><button class="btn quiet" type="button" disabled={s.erasing} onclick={() => handle.close()}>Abbrechen</button><button class="btn primary" type="button" disabled={!s.canSave || s.erasing} onclick={() => void s.save()}>Fertig</button>
