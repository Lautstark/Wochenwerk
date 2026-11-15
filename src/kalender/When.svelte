<script lang="ts">
  /* When it happens and whether it comes back, in rows the way a calendar app
     lays them out: what on the left, the answer on the right, a switch for
     Ganztägig and a value to tap for Wiederholen. The rows only ever grow by
     what the answer above them asked for. */
  import { untrack } from "svelte";
  import { board, clock, dateLabel, minute, weekdays } from "../model.js";
  import type { Editing, Repeat } from "./appointment.svelte.js";
  import type { AddItem } from "@lautstark/design/menu";
  import Dropdown from "@lautstark/design/svelte/Dropdown";
  import Tile from "@lautstark/design/svelte/Tile";
  import TileGrid from "@lautstark/design/svelte/TileGrid";

  let { s }: { s: Editing } = $props();
  const draft = untrack(() => s.draft);

  /* How long it runs, said the way somebody planning says it. Halves get their
     own glyph because „1,5 Std" is a number where the others are a duration. */
  function lasting(minutes: number): string {
    if (minutes <= 0) return "";
    if (minutes < 60) return `${minutes} Min`;
    const hours = Math.floor(minutes / 60), rest = minutes % 60;
    if (rest === 0) return `${hours} Std`;
    if (rest === 30) return `${hours}½ Std`;
    return `${hours} Std ${rest} Min`;
  }
  let lasts = $derived(s.whole ? "" : lasting(minute(s.to) - minute(s.from)));

  /* The two edges are a shortcut, not a third thing to store: pressed means the
     time already *is* the edge of the board's day. Pressing again puts back what
     was there before rather than leaving a time nobody chose. What the sheet
     opened with is a snapshot, overwritten by each press. */
  let priorFrom = untrack(() => s.from), priorTo = untrack(() => s.to);
  let atOpen = $derived(s.from === board.from);
  let atClose = $derived(s.to === board.to);
  function toggleOpen() {
    if (!atOpen) { priorFrom = s.from; s.from = board.from; }
    else s.from = priorFrom === board.from ? clock(minute(board.from) + 60) : priorFrom;
  }
  function toggleClose() {
    if (!atClose) { priorTo = s.to; s.to = board.to; }
    else s.to = priorTo === board.to ? clock(Math.max(minute(s.from) + 30, minute(board.to) - 60)) : priorTo;
  }
  $effect(() => { if (s.whole && s.spanTo < s.date) s.spanTo = s.date; });

  /* A stretch of days says where it stops in its own Bis row and has no
     Wiederholen row at all; a repetition has the row and no Bis. „vom 4. bis
     zum 6." is how somebody says four days away, and a select reading „jeden
     Tag" beside it turns them into a rule. */
  let spanHidden = $derived(!!draft.series && !s.stretch);

  /* „↻ jeden Tag · bis 6.9." — what an existing batch already says, from when
     it holds where this day lies before it. */
  let seriesLine = $derived(!draft.series ? "" : s.batch
    ? `↻ ${s.batch.pattern.kind === "daily" ? "jeden Tag" : s.batch.pattern.kind === "yearly" ? "jedes Jahr"
        : `wöchentlich ${s.batch.pattern.weekdays.map(day => weekdays[day]).join(" ")}`} · bis ${dateLabel(s.batch.until)}`
      + (draft.date < s.batch.from ? ` · gilt ab ${dateLabel(s.batch.from)}` : "")
    : "↻ Teil einer Serie");

  /* A Dropdown and not a `<select>` — conventions.md §6.10 — so each answer is
     its own handler and `checked` makes them alternatives. „einmalig" is left out
     once there is a batch: a series cannot be told it happens once. */
  const REPEATS: ReadonlyArray<readonly [Repeat, string]> = [
    ["none", "einmalig"], ["daily", "jeden Tag"], ["weekly", "wöchentlich"], ["yearly", "jedes Jahr"],
  ];
  let repeatSays = $derived(REPEATS.find(([value]) => value === s.repeat)?.[1] ?? "einmalig");
  const offerRepeats = (add: AddItem) => {
    for (const [value, label] of REPEATS) {
      if (s.batch && value === "none") continue;
      add(label, () => { s.repeat = value; }, { checked: s.repeat === value });
    }
  };
  const toggleDay = (index: number) => {
    s.weekly = s.weekly.includes(index) ? s.weekly.filter(other => other !== index) : [...s.weekly, index];
    if (!s.weekly.length) s.weekly = [index];
  };
</script>

{#snippet shortcut(on: boolean, label: string, time: string, press: () => void)}<button type="button" class="shortcut" aria-pressed={on} onclick={press}>{label}<span class="shortcut__time">{time}</span></button>{/snippet}

<div class="lines">
  <label class="line"><span class="line__what">Ganztägig</span><input class="switch" type="checkbox" bind:checked={s.whole} /></label>
  <label class="line"><span class="line__what">Tag</span><span class="line__value"><input class="field" type="date" bind:value={s.date} /></span></label>
  {#if s.whole}
    <!-- A stretch only while nothing repeats: a rule's end is „Endet am", and
         the save reads the stretch only for „einmalig". -->
    {#if !spanHidden && s.repeat === "none"}<label class="line"><span class="line__what">Bis</span><span class="line__value"><input class="field" type="date" min={s.date} bind:value={s.spanTo} /></span></label>{/if}
  {:else}
    <div class="line line--time"><span class="line__what">Uhrzeit<span class="line__aside">{lasts}</span></span><span class="line__times"><span class="line__value"><input class="field" type="time" aria-label="Von" step={board.snap * 60} bind:value={s.from} /><span class="muted">–</span><input class="field" type="time" aria-label="Bis" step={board.snap * 60} bind:value={s.to} /></span><span class="line__shortcuts">{@render shortcut(atOpen, "Aufstehen", board.from, toggleOpen)}{@render shortcut(atClose, "Schlafengehen", board.to, toggleClose)}</span></span></div>
  {/if}
  {#if !s.stretch}
    <div class="line"><span class="line__what" id="repeatLabel">Wiederholen</span><span class="line__value"><Dropdown field start labelledBy="repeatLabel" label={repeatSays} build={offerRepeats} /></span></div>
    {#if s.repeat === "weekly"}<div class="line line--days"><TileGrid class="picker__grid--tight">{#each weekdays as label, index}<Tile {label} toggle active={s.weekly.includes(index)} onclick={() => toggleDay(index)}><span></span></Tile>{/each}</TileGrid></div>{/if}
    {#if s.repeat !== "none"}<label class="line"><span class="line__what">Endet am</span><span class="line__value"><input class="field" type="date" bind:value={s.until} /></span></label>{/if}
  {/if}
  {#if draft.series && !s.stretch}<p class="line line--note small muted">{seriesLine}</p>{/if}
</div>
