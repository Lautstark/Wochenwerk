<script lang="ts">
  import { WORDS, type ScopeState } from "./scope.svelte.js";
  import type { Handle } from "@lautstark/design/svelte/sheet";
  let { s, handle }: { s: ScopeState; handle: Handle } = $props();
  /* How many the answer standing there would take. „Nur diesen" is one by
     definition; the other two are counted before the sheet opens. */
  let many = $derived(s.picked === "one" ? 1 : s.picked === "from" ? s.counts.from : s.counts.all);
  /* Labelled with the act and with the number, and it follows the radios:
     conventions.md §1.7 — a button reading "OK" asks the reader to hold what it
     refers to in their head, and the count is the one fact in the question that
     could change a mind. */
  let label = $derived(`${many} ${WORDS[s.kind].unit[many === 1 ? 0 : 1]} ${s.verb}`);
  let cancel: HTMLButtonElement;
  /* Focus starts on the way out. `showModal()` would otherwise leave it on the
     first focusable thing in the sheet, and for a question whose other button
     deletes a year of Tuesdays the safe action is the one to be standing on. */
  $effect(() => { cancel.focus(); });
</script>

<span class="spacer"></span><button bind:this={cancel} class="btn quiet" type="button" onclick={() => handle.close()}>Abbrechen</button><button class="btn {s.verb === "löschen" ? "destructive filled" : "primary"}" type="button" onclick={() => { s.answer(s.picked); handle.close(); }}>{label}</button>
