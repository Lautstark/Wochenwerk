<script lang="ts">
  /** One thing that can be picked. Square, because what is picked usually is. */
  import type { Snippet } from "svelte";
  let { label, active, onclick, movable = false, children }: {
    label: string; active: boolean; onclick: () => void; movable?: boolean; children: Snippet;
  } = $props();
</script>

<button class="picker__item{active ? " picker__item--active" : ""}" type="button" title={label} aria-pressed={active} data-move={movable ? "" : undefined} {onclick}>{@render children()}<span class="small">{label}</span></button>
