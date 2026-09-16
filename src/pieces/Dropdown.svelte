<script lang="ts">
  /* A preference with a handful of answers is picked the way the family picks
     things: a button that says what is chosen and opens a menu. A native <select>
     was never one of this system's parts — its open list is drawn by the operating
     system and is the one thing on the page that cannot follow the tokens. */
  import { menuOn } from "@lautstark/design/menu";
  type Add = (item: string, run: () => void, opts?: { checked?: boolean }) => void;
  let { label, build }: { label: string; build: (add: Add) => void } = $props();
  let trigger: HTMLButtonElement;
</script>

<span class="menu-anchor"><button bind:this={trigger} class="btn dropdown" type="button" onclick={() => menuOn(trigger, build)}>{label}</button></span>
