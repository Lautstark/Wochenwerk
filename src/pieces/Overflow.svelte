<script lang="ts">
  /* `menuOn` opens a menu; it does not register one. It is opened from the
     click, never while a row is being built — that opened a menu the next click
     closed again, which looked exactly like a menu that does not work. */
  import { menuOn } from "@lautstark/design/menu";
  type Add = (label: string, run: () => void, opts?: { danger?: boolean }) => void;
  let { build }: { build: (add: Add) => void } = $props();
  let trigger: HTMLButtonElement;
</script>

<button bind:this={trigger} class="btn icon quiet" type="button" aria-label="Mehr" onclick={() => menuOn(trigger, build)}>⋯</button>
