<script lang="ts">
  /**
   * What the board says about this appointment, every sentence of it, and each
   * one open to be rewritten whole.
   *
   * The sentences are the proposal: built from the same frames the board speaks
   * from, so what stands here is what would be said. Rewriting one keeps only
   * what differs from it — `Appointment.said`, one sentence per moment — and an
   * emptied line goes back to the proposal. A word in a field used to stand
   * above this list and changed every sentence at once; one sentence at a time is
   * more to type and the only way to say something the frames cannot.
   *
   * An all-day appointment has one sentence of its own after the day, and it is
   * `speech` as it always was (see `dayFact`). A birthday, a visit and an open
   * choice are said from the people or the cards, so nothing here is typed.
   */
  import PlayButton from "@lautstark/stimmquelle/svelte/PlayButton";
  import { couldSay, fromPeople, type Possible, type Shape } from "../announce.js";
  import { preview } from "../speech.js";
  import type { Moment } from "../model.js";
  import type { Editing } from "./appointment.svelte.js";

  let { s, word, shape }: { s: Editing; word: () => string; shape: () => Shape } = $props();

  let why = $state("");
  let editing = $state<Moment | "day" | null>(null);
  let typed = $state("");

  let fromElsewhere = $derived(fromPeople(shape()));
  /* An all-day fact is a sentence, and the title wrapped is the proposal. */
  let proposedFact = $derived(s.title.trim() ? `Heute ist ${s.title.trim()}.` : "");
  let fact = $derived(s.speech.trim() || proposedFact);
  let ownDay = $derived(s.whole && !fromElsewhere);
  let lines = $derived(couldSay(fromElsewhere ? "" : s.whole ? fact : word(), shape()));
  let dayLines = $derived(lines.filter(line => !line.moment && line.when !== "am Tag davor" && !line.when.startsWith("bis ")));
  let rewritable = $derived(s.mode === "symbols" && !s.whole && !fromElsewhere);

  const shown = (line: Possible) => (rewritable && line.moment && s.said[line.moment]) || line.text;
  function keep(line: Possible, value: string) {
    const said = value.trim(), moment = line.moment!;
    const { [moment]: _, ...rest } = s.said;
    s.said = !said || said === line.text ? rest : { ...rest, [moment]: said };
  }
  function keepFact(value: string) {
    const said = value.trim();
    s.speech = said === proposedFact ? "" : said;
  }

  /* The day sentence as it would sound in the morning, with what is typed so far. */
  const dayText = () => {
    const first = dayLines[0]?.text ?? "";
    return editing === "day" ? first.replace(fact, typed.trim()) : first;
  };
  let listed = $derived(ownDay ? [] : lines);
  export const summary = () => ownDay ? fact : listed[0] ? shown(listed[0]) : "";

  /** What a save renders ahead of the key press: exactly what is listed here. */
  export const sentences = () => lines.map(shown);

  const keys = (event: KeyboardEvent & { currentTarget: HTMLInputElement }, back: string) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); typed = back; event.currentTarget.blur(); }
  };
</script>

<div class="sentences">
  {#if ownDay}
    <div class="sentence"><PlayButton label="Satz anhören" text={dayText} hear={preview} nothing="Erst einen Satz eintippen." trouble={words => { why = words; }} /><input class="say__line" type="text" autocomplete="off" aria-label="Satz über den Tag" placeholder={proposedFact || "z. B. Heute fahren wir zu Oma."} value={editing === "day" ? typed : fact} onfocus={() => { editing = "day"; typed = fact; }} oninput={event => { typed = event.currentTarget.value; }} onblur={() => { keepFact(typed); editing = null; }} onkeydown={event => keys(event, fact)} /><span class="sentence__when">nach „Es ist …“</span></div>
  {/if}
  {#each listed as line, index (index)}
    <div class="sentence"><PlayButton label="Satz anhören" text={() => editing === line.moment ? typed : shown(line)} hear={preview} nothing="" trouble={words => { why = words; }} />{#if rewritable && line.moment}<input class="say__line" type="text" autocomplete="off" aria-label="Satz, {line.when}" placeholder={line.text} value={editing === line.moment ? typed : shown(line)} onfocus={() => { editing = line.moment!; typed = shown(line); }} oninput={event => { typed = event.currentTarget.value; }} onblur={() => { keep(line, typed); editing = null; }} onkeydown={event => keys(event, shown(line))} />{:else}<span class="sentence__text">{line.text}</span>{/if}<span class="sentence__when">{line.when}</span></div>
  {/each}
</div>
{#if !lines.length && !ownDay}<p class="small muted">Ohne Namen wird nichts gesagt.</p>{/if}
<p class="hint" role="status" hidden={!why}>{why}</p>
{#if s.whole}<label class="choice"><input type="checkbox" bind:checked={s.notHome} /><span>Vorher sagen: „Bald fahren wir weg.“</span></label>{/if}
