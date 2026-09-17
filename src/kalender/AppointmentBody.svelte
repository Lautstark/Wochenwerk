<script lang="ts">
  import { untrack } from "svelte";
  import { addDays, board, bornOn, cardSays, clock, dateLabel, dayLabel, iso, minute, samePattern,
    strays, titleOf, weekdays, type Pattern, type Person, type SymbolRef } from "../model.js";
  import { createSeries, dropSeries, editSeries, put, reachOf, remove, repattern, reshapeOf, seriesFrom, uuid } from "../db.js";
  import { cardById, load, shown } from "../store.svelte.js";
  import { prepare } from "../speech.js";
  import { pictureFor, pictures, providerInUse, refFor, sourceInUse } from "../symbols.js";
  import { confirmDialog } from "../views/dialog.js";
  import { moved, reorder } from "../views/reorder.js";
  import { askScope } from "./scope.svelte.js";
  import type { Editing, Repeat } from "./appointment.svelte.js";
  import type { Handle } from "@lautstark/design/svelte/sheet";
  import type { AddItem } from "@lautstark/design/menu";
  import Dropdown from "@lautstark/design/svelte/Dropdown";
  import Tile from "@lautstark/design/svelte/Tile";
  import TileGrid from "@lautstark/design/svelte/TileGrid";
  import SymbolSearch from "@lautstark/bildquelle/svelte/SymbolSearch";
  import Face from "../pieces/Face.svelte";
  import Picture from "../pieces/Picture.svelte";
  import SpeechField from "../pieces/SpeechField.svelte";
  import CardEditor from "./CardEditor.svelte";

  let { s, handle }: { s: Editing; handle: Handle } = $props();
  const draft = s.draft;
  let speechField: SpeechField;
  let search: SymbolSearch;

  /* The chosen row is the one grid here that is wired, and `use:` is an element
     directive while `<TileGrid>` is a component — so the same wiring arrives as
     an attachment, which Svelte passes through the component's own spread onto
     the div. This is also where the grid element comes from, and the keyboard
     move needs it: once the new order is written down the row is drawn again, so
     the tile that moved is a different element and has to be found afresh.
     Declared once rather than inline, because an attachment re-runs when its
     expression changes and a fresh closure every redraw would wire the grid
     again on top of itself.

     ## Two grids answering ← and →, and what keeps them apart
     §6.4 names this as wochenwerk's one collision to resolve. Since the search
     became @lautstark/bildquelle/svelte/SymbolSearch there are two grids of
     `.picker__item`s on this form, one element apart, and both want the arrow
     keys: this one carries a symbol past its neighbour, the results box walks
     a roving tabindex across the hits.

     They stay apart because neither handler is on an ancestor of the other's
     tiles. `reorder` listens on *this* grid and the results box listens on
     itself; they are siblings inside `.stack`, so a key pressed in one never
     bubbles through the other and no stopPropagation is needed anywhere. Both
     then narrow again on their own terms — reorder.ts asks for the nearest
     `[data-move]`, which the search's tiles do not carry and neither does the
     ＋ slot at the end of this row, and the results box asks whether what has
     focus is one of the buttons it drew. Held by two e2e cases: → on a chosen
     symbol still reorders, and → on a search result leaves this row's order
     exactly where it was. */
  const ordering = (grid: HTMLElement) => reorder(grid, (from, to) => {
    draft.symbols = moved(draft.symbols, from, to);
    queueMicrotask(() => grid.querySelectorAll<HTMLElement>("[data-move]")[to]?.focus());
  });

  /* How long it runs, said the way somebody planning says it. The grid shows this
     in height and the sheet showed it nowhere, so „Von 08:00 Bis 09:00" left the
     one fact both fields are about to be worked out. Halves get their own glyph
     because „1,5 Std" is a number where the others are a duration. */
  function lasting(minutes: number): string {
    if (minutes <= 0) return "";
    if (minutes < 60) return `${minutes} Min`;
    const hours = Math.floor(minutes / 60), rest = minutes % 60;
    if (rest === 0) return `${hours} Std`;
    if (rest === 30) return `${hours}½ Std`;
    return `${hours} Std ${rest} Min`;
  }

  /* The fields, copied into the draft as they change — what `read()` did on
     every keystroke. Read first, written under untrack, so that the write of a
     field's own value back into the draft is not a dependency of itself. */
  $effect(() => {
    const { title, speech, date, whole, from, to, notHome, showPeople } = s;
    untrack(() => {
      draft.title = title.trim() || undefined;
      draft.speech = speech.trim() || undefined;
      if (date) draft.date = date;
      if (whole) { draft.start = undefined; draft.end = undefined; }
      else { draft.start = from || "09:00"; draft.end = to || "09:30"; }
      /* Absent rather than false where it was not ticked: a flag nobody set is one
         the record does not carry, and every other optional field here is written
         the same way. */
      draft.away = whole && notHome ? true : undefined;
      draft.showPeople = showPeople;
    });
  });

  /* Where this one sits in the batch is where it was written, not what the day
     field currently says: an unsaved move must not change what "and all
     following" reaches. */
  $effect(() => {
    if (s.existing && draft.series) {
      void Promise.all([reachOf(draft.series, s.anchor), reachOf(draft.series)])
        .then(([from, all]) => { s.counts = { from: from.length, all: all.length }; });
    }
  });

  /* The two edges are a shortcut, not a third thing to store: ticked means the
     time already *is* the edge of the board's day, so an appointment that starts
     at seven arrives with the box ticked and no record has to say so. Unticking
     puts back what was there before rather than leaving the box ticked over a
     time nobody chose. */
  let priorFrom = s.from, priorTo = s.to;
  let atOpen = $derived(s.from === board.from);
  let atClose = $derived(s.to === board.to);
  function toggleOpen(on: boolean) {
    if (on) { priorFrom = s.from; s.from = board.from; }
    else s.from = priorFrom === board.from ? clock(minute(board.from) + 60) : priorFrom;
  }
  function toggleClose(on: boolean) {
    if (on) { priorTo = s.to; s.to = board.to; }
    else s.to = priorTo === board.to ? clock(Math.max(minute(s.from) + 30, minute(board.to) - 60)) : priorTo;
  }
  let runs = $derived(minute(s.to) - minute(s.from));
  let lasts = $derived(s.whole ? "" : lasting(runs));
  $effect(() => { if (s.whole && s.spanTo < s.date) s.spanTo = s.date; });
  /* One field for one fact, and the fact is where the stretch stops.
     Beside the day it is what a person came to change: „vom 4. bis zum 6."
     is how somebody says four days away, and it is how they change them.
     Under Wiederholen the same date is the end of a rule, and it stands next
     to a select reading „jeden Tag" — which turns four days at a
     grandmother's into a repetition on the one screen where somebody is
     looking at what it is. So a stretch carries the field here and no
     Wiederholen row at all, and a repetition carries the row and no field. */
  let spanHidden = $derived(!!draft.series && !s.stretch);

  /* What the other half was holding, so that flipping can be flipped back.
     Going over used to drop the symbols on the spot and coming back found them
     gone; it is held here rather than thrown away, the way the two day edges hold
     the times they replace. */
  function flip(to: "symbols" | "choice") {
    if (s.mode === to) return;
    s.mode = to;
    if (to === "choice") { s.priorSymbols = draft.symbols; draft.symbols = []; draft.options = s.priorOptions; s.foldOpen = true; }
    else { s.priorOptions = draft.options; draft.options = []; draft.symbols = s.priorSymbols; }
  }

  /* „↻ jeden Tag · bis 6.9." is the same claim in words. A stretch says where
     it stops in its own field and needs no second line about a rule. An
     appointment lying before where the rule starts belongs to the batch but was
     not written by that rule, so the line says from when the rule holds rather
     than claiming it over a day it never covered. */
  let seriesLine = $derived(!draft.series ? "" : s.batch
    ? `↻ ${s.batch.pattern.kind === "daily" ? "jeden Tag" : s.batch.pattern.kind === "yearly" ? "jedes Jahr"
        : `wöchentlich ${s.batch.pattern.weekdays.map(day => weekdays[day]).join(" ")}`} · bis ${dateLabel(s.batch.until)}`
      + (draft.date < s.batch.from ? ` · gilt ab ${dateLabel(s.batch.from)}` : "")
    : "↻ Teil einer Serie");

  /* The week's map only knows the symbols that were already on the board, so a
     symbol just picked out of the search has no picture in it and drew as its own
     label. What is picked here is resolved here — once per symbol, and kept. */
  let known = $state.raw(new Map(shown().pictures));
  $effect(() => {
    const missing = draft.symbols.filter(symbol => !pictureFor(known, symbol)).map(symbol => $state.snapshot(symbol));
    if (missing.length) void pictures(missing).then(found => { known = new Map([...known, ...found]); });
  });

  /* Nothing to type while the cards do the talking, so the field and its label
     go and the sentences stand alone. */
  let saidByCards = $derived(s.mode === "choice" && !draft.chosen);
  let named = $derived(draft.people.map(id => shown().people.find(person => person.id === id)?.name).filter(Boolean) as string[]);
  let peopleState = $derived(named.length ? named.join(", ") + (draft.showPeople ? " · am Board" : "") : "niemand");

  /* A choice with one card is not a choice, and one with none is empty. A fixed
     appointment with no symbol is the same kind of empty — with one exception: an
     all-day appointment carrying people and no symbol is the visit, and the visit
     is *defined* by having no symbol. */
  let visiting = $derived(s.whole && draft.people.length > 0);
  let short = $derived(s.mode === "choice" && draft.options.length < 2);
  let bare = $derived(s.mode === "symbols" && !draft.symbols.length && !visiting);
  $effect(() => { s.canSave = !short && !bare; });
  let wantMore = $derived(bare
    ? "Such ein Symbol aus, sonst bleibt die Karte am Board leer."
    : draft.options.length === 0
      ? "Wähl mindestens zwei Karten aus."
      : "Noch eine Karte — zwischen einer allein gibt es nichts zu wählen.");

  if (!s.until) s.until = s.batch ? s.batch.until : iso(addDays(new Date(`${draft.date}T00:00`), 55));

  /* What the board says about this appointment. Empty means the name, which is
     the ordinary case: the board draws symbols and never a title, so a title is
     free to carry what the child is not told — a room, a practice, a surname —
     and this is where the two come apart. docs/speech.md. */
  const instead = () => s.whole
    ? (s.title.trim() ? `Heute ist ${s.title.trim()}.` : "")
    : s.title.trim() || cardSays(shown().cards.get(draft.chosen ?? "")) || "";
  const shape = () => {
    const on = draft.people.map(id => shown().people.find(person => person.id === id)).filter(Boolean) as Person[];
    const born = s.whole ? on.filter(person => bornOn(person, draft.date)) : [];
    const ages = new Set(born.map(person => Number(draft.date.slice(0, 4)) - Number(person.birthday!.slice(0, 4))));
    return {
      /* One person is an address; two is a list, and a list is not an address. */
      who: on.length === 1 ? on[0]!.name : undefined,
      /* On the mode rather than on the count: a choice with no cards added yet
         is still a choice, and a name typed into it would still never be said. */
      ...(s.mode === "choice" && !draft.chosen
        ? { offering: draft.options.map(id => cardSays(shown().cards.get(id)) ?? "") }
        : {}),
      picked: !!draft.chosen,
      allDay: s.whole,
      away: s.whole && s.notHome,
      date: draft.date,
      ...(born.length ? { birthday: { names: born.map(person => person.name), age: ages.size === 1 ? [...ages][0] : undefined } } : {}),
      ...(s.whole && on.length && !born.length && !draft.symbols.length ? { visiting: on.map(person => person.name) } : {}),
    };
  };

  /* Wiederholen, which was a native `<select class="field">` until this round.
     conventions.md §6.10: a `<select>` is not a dropdown — its open list is drawn
     by the operating system and is the one thing on a page that cannot follow the
     tokens, which stopped being survivable when the scheme became a choice. The
     rule was written in three places, one of them the header of this product's
     own `pieces/Dropdown.svelte`, and this control broke it.

     Converting is not a markup swap. `bind:value` is gone, so each answer is its
     own handler and the trigger reads the answer back out of `s.repeat` rather
     than keeping a second copy of it; the answers are named once, here, because
     the menu needs the word for the item and the trigger needs the same word for
     what is chosen. `checked` is what makes them alternatives rather than four
     equal commands — menu.js gives a checked item `role="menuitemradio"` and
     `aria-checked`, which is the half of a `<select>`'s announcement a plain list
     would have dropped. „einmalig" is left out once there is a batch, exactly as
     the `<option>` list was filtered: a series cannot be told it happens once.

     ## `field`, which draws since design v1.38.1

     §6.10 argues for `field` in exactly this position — a column of questions,
     where a trigger as wide as its answer leaves four controls with no left
     edge to follow down — and the trigger beside this one is a full-width date
     field, so that argument is right about this row. It shipped as `.btn`
     anyway, because `field` did not draw: `.dropdown::after` is `flex: none`
     and presumes a flex container, `.btn` supplied `display: inline-flex` and
     `.field` supplied no display at all, so the chevron computed
     `display: inline` where its 10×7 does not apply and the answer took the
     user agent's `text-align: center`. This declined to write the missing rule
     from here — a `display` on `.field` is design's to add, and a product rule
     putting one back would be the next product writing it again. vorlaut had
     been carrying that rule in its own `ui.css` with the same reasoning, which
     is what made it a shared one rather than two private workarounds; it is
     `.field.dropdown` in `components.css` since v1.38.1 and both copies can go.

     So this row was measured again rather than left alone, and `field` wins on
     the numbers §6.10 is about. Both draw the chevron now (10×7, `display:
     block`). What separates them is the left edge and the width: `.btn` is as
     wide as the word on it — 108px on „einmalig", 133px on „wöchentlich" —
     where `field` takes the column, 422px beside the „Bis" date field and the
     same 422px as „Tag" above it, or the full 854px of the segmented control
     and the Ansage row when „Bis" is hidden. Every control in this sheet starts
     at x=213; the `.btn` pill was the only one that stopped early, and it
     stopped in bold 14px on a visible border while the fields around it are
     regular 15px on none, so it read as a command in a column of answers. The
     row grows 3px taller (66 → 69) and nothing else moves.

     `start` because the list belongs under the left edge of a control at the
     left of a form column, not under the right edge of the row. */
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

  /* Whether the search is on screen at all, asked once because two things read
     it. `busy` is §6.4's suppression and empties the component — its field, its
     grid and its credit all take `hidden`, and nothing is unmounted, which is
     what keeps the caret. What `busy` cannot do is take the wrapper out of this
     column: it is still a grid item, and an empty grid item in a 12px `.stack`
     is 12px of nothing between the chosen row and Ansage. Measured against the
     `<select>` build: 24px where there were 12. So the wrapper is switched off
     from here, which is the component's own division of labour — „where this
     sits and how it is spaced belongs to the page". */
  let searchOff = $derived(s.mode === "choice" || !s.searching);

  const togglePerson = (id: string) => {
    draft.people = draft.people.includes(id) ? draft.people.filter(other => other !== id) : [...draft.people, id];
  };
  const toggleDay = (index: number) => {
    s.weekly = s.weekly.includes(index) ? s.weekly.filter(other => other !== index) : [...s.weekly, index];
    if (!s.weekly.length) s.weekly = [index];
  };

  s.erase = async () => {
    if (draft.series) {
      const scope = await askScope("löschen", $state.snapshot(s.counts), { kind: s.shapeOfBatch() });
      if (!scope) return;
      if (scope !== "one") { await dropSeries(draft.series, scope === "from" ? s.anchor : undefined); handle.close(); return s.done(); }
    } else {
      const sure = await confirmDialog({
        title: "Termin löschen", body: `„${titleOf(draft, shown().cards, shown().people) || "Dieser Termin"}“ am ${dayLabel(draft.date)} wird gelöscht.`,
        confirmLabel: "Löschen", danger: true,
      });
      if (!sure) return;
    }
    await remove(draft.id);
    handle.close();
    s.done();
  };

  s.save = async () => {
    /* Rendered here rather than at the key press: planning is a moment somebody
       is already waiting through, and a child pressing a key is not. Not awaited
       — the sheet closes and the cache fills behind it. */
    void prepare(speechField.sentences());
    if (!s.whole && minute(draft.end!) <= minute(draft.start!)) draft.end = clock(minute(draft.start!) + board.snap);
    /* What the child already picked is only wrong if it is no longer on offer.
       Clearing it on every save threw away an answer that was still good. */
    if (s.mode === "symbols") { draft.options = []; draft.chosen = undefined; }
    else { draft.symbols = []; if (draft.chosen && !draft.options.includes(draft.chosen)) draft.chosen = undefined; }
    const plain = $state.snapshot(draft);
    /* What a batch writes across its days is everything the appointment says
       except the four things that belong to a day rather than to the batch —
       which is `Shape`, and is taken by leaving those out rather than by naming
       what stays. `chosen` is one of the four on purpose: this is written across
       days other than this one, and an answer given on Monday is not an answer
       for Tuesday. */
    const { id: _id, date: _date, series: _batch, chosen: _chosen, updatedAt: _at, ...shape } = plain;
    const batch = s.batch;

    if (batch) {
      const pattern: Pattern = s.repeat === "weekly" ? { kind: "weekly", weekdays: [...s.weekly].sort((one, other) => one - other) }
        : s.repeat === "yearly" ? { kind: "yearly" } : { kind: "daily" };
      const stop = (s.stretch ? s.spanTo : s.until) || batch.until;
      const changed = !samePattern(pattern, batch.pattern);
      /* Where a new rule starts: the appointment somebody opened, and never earlier
         than today. What is already behind us is what was planned, and a rule
         changed now does not get to say otherwise. */
      const now = iso(new Date());
      const cut = changed ? (plain.date > now ? plain.date : now) : batch.from;
      if (changed || stop !== batch.until) {
        const change = await reshapeOf(batch.id, pattern, cut, stop);
        /* Writing days nobody had is not worth a question. Removing days somebody
           may have edited by hand is — and how many of those there are is the half
           of the cost a bare count leaves out. */
        if (change.dropping.length) {
          const own = change.dropping.filter(item => strays(item, plain)).length;
          const sure = await confirmDialog({
            title: "Serie ändern", danger: true, confirmLabel: "Ändern",
            body: [`${change.dropping.length} Termine fallen weg${own ? `, ${own} davon mit eigenen Änderungen` : ""}`,
              change.adding.length ? `${change.adding.length} kommen dazu` : "",
              changed ? `ab ${dateLabel(cut)} — was davor liegt, bleibt wie es ist` : ""].filter(Boolean).join(", ") + ".",
          });
          if (!sure) return;
        }
        const gone = change.dropping.some(item => item.id === plain.id);
        /* A cut leaves a second batch, and it is the one this day is now in — so
           what follows changes that one and not the stretch behind it. */
        draft.series = plain.series = (await repattern(batch.id, pattern, cut, stop)).series;
        /* The day this one stood on may be one the new rule no longer covers, in
           which case it has just been removed and must not be written back. */
        if (gone) { handle.close(); return s.done(); }
      }
    }
    if (s.existing && plain.series) {
      /* Only what the appointment itself says is a change over the batch. A rule
         changed and nothing else is one answer already given. */
      if (!strays(plain, s.appointment) && plain.date === s.anchor) { handle.close(); return s.done(); }
      const counts = { from: (await reachOf(plain.series, s.anchor)).length, all: (await reachOf(plain.series)).length };
      /* The day is the one thing a change over a batch cannot carry: which days a
         batch falls on is what its rule says, and that is a row further up. */
      const movedDay = plain.date !== s.anchor;
      const scope = await askScope("ändern", counts, { kind: s.shapeOfBatch(),
        note: movedDay ? "Der Tag gilt nur für diesen Termin. Wann die Serie stattfindet, steht unter „Wiederholen“." : undefined });
      if (!scope) return;
      if (scope !== "one") {
        await editSeries(plain.series, shape, scope === "from" ? s.anchor : undefined);
        if (movedDay) await put(plain);
        handle.close();
        return s.done();
      }
    }
    if (!plain.series) {
      /* A multi-day all-day appointment is a daily batch: one record per day, the
         same mechanism a weekly Kita uses, only shorter. */
      const spans = s.whole && s.spanTo > plain.date && s.repeat === "none";
      if (spans || s.repeat !== "none") {
        const pattern: Pattern = spans ? { kind: "daily" }
          : s.repeat === "weekly" ? { kind: "weekly", weekdays: $state.snapshot(s.weekly) } : s.repeat === "yearly" ? { kind: "yearly" } : { kind: "daily" };
        const stop = spans ? s.spanTo : (s.until || plain.date);
        const from = plain.date;
        if (s.existing) await seriesFrom({ ...plain, ...shape }, pattern, stop);
        else await createSeries(pattern, from, stop < from ? from : stop, shape);
        handle.close();
        return s.done();
      }
    }
    await put(plain);
    handle.close();
    s.done();
  };

  /* Making a card without leaving the appointment being planned. It ends by
     dropping the editor and letting the list draw again — with the new card
     already offered when there is one, which is the whole reason the button is here
     rather than in the settings. */
  async function madeCard(id: string | null) {
    s.making = false;
    if (id) { draft.options = [...draft.options, id]; await load(); }
  }
</script>

<div class="stack">
  <div class="row-of row-of--top"><div class="field-col"><label class="field-row"><span class="lbl">Tag</span><input class="field" type="date" bind:value={s.date} /></label><label class="choice"><input type="checkbox" bind:checked={s.whole} /><span><span>Ganztägig</span></span></label></div><div class="field-col" hidden={s.whole}><label class="field-row"><span class="lbl">Von</span><input class="field" type="time" step={board.snap * 60} bind:value={s.from} /></label><label class="choice"><input type="checkbox" checked={atOpen} onchange={event => toggleOpen(event.currentTarget.checked)} /><span><span>ab dem Aufstehen</span><span class="muted"> {board.from}</span></span></label></div><div class="field-col" hidden={s.whole}><label class="field-row"><span class="lbl lbl--split"><span>Bis</span><span class="lbl__aside">{lasts}</span></span><input class="field" type="time" step={board.snap * 60} bind:value={s.to} /></label><label class="choice"><input type="checkbox" checked={atClose} onchange={event => toggleClose(event.currentTarget.checked)} /><span><span>bis zum Schlafengehen</span><span class="muted"> {board.to}</span></span></label></div><div class="field-col" hidden={!s.whole}><label class="field-row" hidden={spanHidden}><span class="lbl">Bis</span><input class="field" type="date" min={s.date} bind:value={s.spanTo} /></label><label class="choice"><input type="checkbox" bind:checked={s.notHome} /><span><span>Wir sind nicht zu Hause</span></span></label></div></div>
  <!-- A <div> and not a <label>, and that is the conversion rather than a
       detail of it: a <label> does not name a <button>, so the question has to
       reach the trigger as `aria-labelledby`. The same defect was sitting
       untested in this product's other Dropdown call site, in SettingsBody. -->
  <div class="stack" hidden={!!s.stretch}><div class="row-of"><div class="field-row"><span class="lbl" id="repeatLabel">Wiederholen</span><Dropdown field start labelledBy="repeatLabel" label={repeatSays} build={offerRepeats} /></div><label class="field-row" hidden={s.repeat === "none"}><span class="lbl">Bis</span><input class="field" type="date" bind:value={s.until} /></label></div><TileGrid class="picker__grid--tight" hidden={s.repeat !== "weekly"}>{#each weekdays as label, index}<Tile {label} toggle active={s.weekly.includes(index)} onclick={() => toggleDay(index)}><span></span></Tile>{/each}</TileGrid></div>
  <p class="small muted" hidden={!draft.series || !!s.stretch}>{seriesLine}</p>
  <div><span class="lbl">Am Board</span><div class="segmented"><button type="button" aria-pressed={s.mode === "symbols"} onclick={() => flip("symbols")}>steht fest</button><button type="button" aria-pressed={s.mode === "choice"} onclick={() => flip("choice")}>wird ausgesucht</button></div></div>
  <p class="notice bad" hidden={!short && !bare}>{wantMore}</p>
  <div class="chosen" hidden={s.mode === "choice"}><TileGrid {@attach ordering}>{#each draft.symbols as symbol, index (symbol.source + symbol.id)}<Tile label={symbol.label} toggle active={true} data-move="" onclick={() => { draft.symbols = draft.symbols.filter((_, at) => at !== index); }}><Picture {symbol} name={symbol.label} {known} /></Tile>{/each}<Tile label="Symbol" class="picker__item--add" onclick={() => { s.searching = true; queueMicrotask(() => search.focus()); }}><span class="picker__add">＋</span></Tile></TileGrid><p class="small muted" hidden={draft.symbols.length < 2}>Zieh sie in die Reihenfolge, in der sie am Board stehen — oder ← und →.</p></div>
  <!-- `busy` and the class answer the same question; see `searchOff` above for
       why it takes both. See CardEditor for why `onescape` is left unwired in
       both of this product's two search fields. -->
  <SymbolSearch bind:this={search} class="search{searchOff ? " search--off" : ""}" busy={searchOff} provider={providerInUse()} limit={18} words={{ field: "Symbol suchen", placeholder: "z. B. Spielplatz" }} onpick={candidate => { const ref = refFor(sourceInUse(), candidate); if (!draft.symbols.some(symbol => symbol.source === ref.source && symbol.id === ref.id)) draft.symbols = [...draft.symbols, ref]; search.clear(); }}>{#snippet caption(candidate)}<span class="small">{candidate.label}</span>{/snippet}</SymbolSearch>
  <div class="stack" hidden={s.mode !== "choice"}>{#if s.making}<CardEditor card={{ id: uuid(), name: "", updatedAt: 0 }} done={id => void madeCard(id)} />{:else}{#if draft.options.length}<TileGrid>{#each draft.options as id}<Tile label={cardById(id)?.name ?? "?"} toggle active={true} onclick={() => { draft.options = draft.options.filter(other => other !== id); }}><Picture symbol={cardById(id)?.symbol} name={cardById(id)?.name ?? "?"} /></Tile>{/each}</TileGrid>{/if}<p class="small muted">Karten mit NFC-Tag, die du hinlegst.</p><TileGrid>{#each [...shown().cards.values()].filter(card => !draft.options.includes(card.id)) as card}<Tile label={card.name} toggle active={false} onclick={() => { draft.options = [...draft.options, card.id]; }}><Picture symbol={card.symbol} name={card.name} /></Tile>{/each}</TileGrid><button class="btn sm" type="button" onclick={() => { s.making = true; }}>＋ Neue Karte</button>{/if}</div>
  <label class="field-row"><span class="lbl" hidden={saidByCards}>Ansage</span><SpeechField bind:this={speechField} bind:value={s.speech} bind:foldOpen={s.foldOpen} {instead} {shape} rowHidden={saidByCards} /></label>
  <details class="more"><summary><span class="section">Personen</span><span class="state">{peopleState}</span></summary><div class="stack"><TileGrid>{#each shown().people as person}<Tile label={person.name} toggle active={draft.people.includes(person.id)} onclick={() => togglePerson(person.id)}><Face {person} /></Tile>{/each}</TileGrid><label class="choice" hidden={!draft.people.length}><input type="checkbox" bind:checked={s.showPeople} /><span>Am Board zeigen</span></label></div></details>
</div>
