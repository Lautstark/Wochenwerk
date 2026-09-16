<script lang="ts">
  /**
   * The word a record is said with, and a way to hear it before deciding.
   *
   * Empty is the ordinary state and the placeholder is what would be said instead,
   * so the field shows the answer without storing it: a household that is happy
   * with the name types nothing, and `speech` stays the override it is meant to be
   * rather than a second copy of the name to keep in step. See docs/speech.md.
   *
   * Hearing it is the reason this is a component and not two lines in a dialog —
   * choosing a word for a two-year-old without hearing it is choosing blind, and
   * the same trap was already there for the voice itself.
   */
  import { couldSay, fromPeople, type Shape } from "../announce.js";
  import PlayButton from "./PlayButton.svelte";

  let { value = $bindable(""), instead, shape = () => ({}), list = true, rowHidden = false, foldOpen = $bindable(false) }: {
    value?: string; instead: () => string; shape?: () => Shape; list?: boolean;
    /* A choice has no word of its own to type, so the row goes and the list of
       sentences stays — which is the only part of this that a choice has. */
    rowHidden?: boolean; foldOpen?: boolean;
  } = $props();

  let why = $state("");
  const word = () => value.trim() || instead();
  /* A birthday and a visit are said from the person on the record, and
     `dayClause` asks about people before it asks about a name — so a word
     typed here would be written and never spoken. The field says that
     instead of inviting one. */
  let own = $derived(fromPeople(shape()));
  let placeholder = $derived(own
    ? (shape().offering !== undefined ? "Wird von den Karten gesagt" : "Wird von der Person gesagt")
    : instead() || "Ohne Namen wird nichts gesagt");
  /* A whole sentence for a day, a word for everything else. The placeholder
     shows one of the two and cannot say which it is, so the label does. */
  let title = $derived(shape().allDay ? "Ein ganzer Satz über den Tag" : "Ein Wort, das in jeden Satz passt");
  let possible = $derived(list ? couldSay(own ? "" : word(), shape()) : []);
  let summary = $derived(own
    ? (shape().offering !== undefined
        ? `Was gesagt wird, solange nichts gewählt ist (${possible.length})`
        : `Was an diesem Tag gesagt wird (${possible.length})`)
    : `Alle Sätze mit diesem Wort (${possible.length})`);
  /* Where the sentences do not come from this field — a birthday, a visit — there
     is no word here to play, and asking for one said "Erst einen Namen eintippen"
     about a sentence that was never going to contain a name. It plays what would
     actually be said instead. */
  const hearWord = () => fromPeople(shape()) ? couldSay("", shape())[0]?.text ?? "" : word();

  /** What a save should render ahead of the key press. The same list the fold
      shows, so what a person was offered to hear is exactly what is prepared. */
  export const sentences = () => (list ? couldSay(fromPeople(shape()) ? "" : word(), shape()) : []).map(line => line.text);
</script>

<div class="speech"><div class="speech-row" hidden={rowHidden}><input class="field" type="text" autocomplete="off" bind:value disabled={own} {placeholder} {title} /><PlayButton label="Ansage anhören" text={hearWord} trouble={words => { why = words; }} /></div><p class="hint" role="status">{why}</p><details class="sentences__fold" hidden={!possible.length} bind:open={foldOpen}><summary>{summary}</summary><div class="sentences">{#each possible as line}<div class="sentence"><PlayButton label="Satz anhören" text={() => line.text} trouble={words => { why = words; }} /><span class="sentence__text">{line.text}</span><span class="sentence__when">{line.when}</span></div>{/each}</div></details></div>
