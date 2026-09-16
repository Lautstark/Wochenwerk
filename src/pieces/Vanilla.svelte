<script lang="ts">
  /* A node built outside Svelte — one of the family's shared panels, which are
     plain DOM by design — standing among components. `display: contents` keeps
     the wrapper out of the layout, so the panel sits in its parent's grid or
     flex as the direct child it would otherwise have been; nothing in the
     stylesheets addresses these panels by parent, which is what makes the
     wrapper safe. */
  let { node }: { node: HTMLElement | null | undefined } = $props();
  let host: HTMLElement;
  $effect(() => { if (node) host.replaceChildren(node); else host.replaceChildren(); });
</script>

<div bind:this={host} style="display:contents"></div>
