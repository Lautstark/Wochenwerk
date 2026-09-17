<script lang="ts">
  import type { Editing } from "./appointment.svelte.js";
  import type { Handle } from "@lautstark/design/svelte/sheet";
  let { s, handle }: { s: Editing; handle: Handle } = $props();
</script>

{#if s.existing}<button class="btn destructive" type="button" onclick={() => void s.erase()}>Löschen</button>{:else}<span></span>{/if}<span class="spacer"></span><button class="btn quiet" type="button" onclick={() => handle.close()}>Abbrechen</button><button class="btn primary" type="button" disabled={!s.canSave} onclick={() => void s.save()}>Fertig</button>
