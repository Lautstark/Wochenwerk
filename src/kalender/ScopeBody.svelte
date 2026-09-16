<script lang="ts">
  import { WORDS, type ScopeState } from "./scope.svelte.js";
  let { s }: { s: ScopeState; handle: unknown } = $props();
  let words = $derived(WORDS[s.kind]);
  /* The middle answer is offered only where it is a third answer. Standing on
     the first day of a batch it reaches everything, and standing on the last it
     reaches one — so it comes up as „Diesen und alle folgenden (3)" beside
     „Alle (3)", the same answer under two names and the same number on both.
     The first day is also where somebody almost always is, because it is where
     the bar starts and where the sheet is opened from. */
  let between = $derived(s.counts.from !== s.counts.all && s.counts.from > 1);
</script>

<div class="stack">
  <label class="choice"><input type="radio" name="scope" value="one" bind:group={s.picked} /><span>{words.one}</span></label>
  {#if between}<label class="choice"><input type="radio" name="scope" value="from" bind:group={s.picked} /><span>{words.from}</span><span class="small muted">({s.counts.from})</span></label>{/if}
  <label class="choice"><input type="radio" name="scope" value="all" bind:group={s.picked} /><span>{words.all}</span><span class="small muted">({s.counts.all})</span></label>
  {#if s.note}<p class="small muted">{s.note}</p>{/if}
</div>
