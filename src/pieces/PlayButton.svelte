<script lang="ts">
  /* One kind of play button, made in one place, for every surface that offers to
     say something. Busy is the button dimming, not its face changing: a glyph
     swapped for "…" inside a pill resizes it, and a control that jumps under the
     pointer reads as a different control. `.btn:disabled` already carries the
     dimming. */
  import { preview } from "../speech.js";
  let { label, text, trouble }: { label: string; text: () => string; trouble: (words: string) => void } = $props();
  let busy = $state(false);
  async function hear() {
    const said = text();
    trouble("");
    if (!said) { trouble("Erst einen Namen eintippen."); return; }
    busy = true;
    const why = await preview(said);
    busy = false;
    /* Said beside the thing rather than handed upwards: every surface this sits
       on is a panel with no status line of its own, and a problem with one word
       belongs next to that word rather than at the far end of a sheet. */
    if (why) trouble(why);
  }
</script>

<button class="btn quiet icon sm" type="button" aria-label={label} disabled={busy} onclick={hear}>▶</button>
