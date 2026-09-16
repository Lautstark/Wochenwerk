<script lang="ts">
  /** A row in a list: what it is, what it is set to, and what can be done with it.
      The actions sit in a `.menu-anchor`, which is where `menuOn` puts the menu and
      what its click-outside guard looks for — without it a menu closes on the click
      that opened it. */
  import type { Snippet } from "svelte";
  let { title, state, lead, actions }: { title: string; state: string | Snippet; lead?: Snippet; actions: Snippet } = $props();
</script>

<div class="row row--line">{#if lead}{@render lead()}{/if}<span class="row__title">{title}</span>{#if typeof state === "string"}<span class="row__state small muted">{state}</span>{:else}{@render state()}{/if}<div class="row__actions menu-anchor">{@render actions()}</div></div>
