<script lang="ts">
  import { untrack } from "svelte";
  import { board, bornOn, cardSays, clock, dateLabel, dayLabel, iso, minute, samePattern,
    strays, titleOf, type Pattern, type Person, type SymbolRef } from "../model.js";
  import { createSeries, dropSeries, editSeries, put, reachOf, remove, repattern, reshapeOf, seriesFrom, uuid } from "../db.js";
  import { cardById, load, shown } from "../store.svelte.js";
  import { prepare } from "../speech.js";
  import { pictureFor, pictures } from "../symbols.js";
  import { confirmDialog } from "../views/dialog.js";
  import { moved, reorder } from "../views/reorder.js";
  import { askScope } from "./scope.svelte.js";
  import type { Editing } from "./appointment.svelte.js";
  import type { Handle } from "@lautstark/design/svelte/sheet";
  import Tile from "@lautstark/design/svelte/Tile";
  import TileGrid from "@lautstark/design/svelte/TileGrid";
  import Face from "../pieces/Face.svelte";
  import Picture from "../pieces/Picture.svelte";
  import PictureChooser from "../pieces/PictureChooser.svelte";
  import CardEditor from "./CardEditor.svelte";
  import Sayings from "./Sayings.svelte";
  import When from "./When.svelte";

  let { s, handle }: { s: Editing; handle: Handle } = $props();
  /* Read once, on purpose. `s` is the one state object this sheet was opened
     with and nothing hands it another, and `draft` is the record inside it that
     every control writes into in place — so this holds *that object*, not a
     copy of its values, and every read through it is live. `untrack` says the
     one-time read is meant. */
  const draft = untrack(() => s.draft);
  /* State, because the fold's summary reads through it and is drawn before the
     fold's own content has mounted. */
  let sayings = $state<Sayings>();

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
    queueMicrotask(() => grid.querySelectorAll<HTMLElement>("[data-move]")[to]?.querySelector<HTMLElement>(".pic-tile")?.focus());
  });

  /* The fields, copied into the draft as they change — what `read()` did on
     every keystroke. Read first, written under untrack, so that the write of a
     field's own value back into the draft is not a dependency of itself. */
  $effect(() => {
    const { title, speech, date, whole, from, to, notHome, showPeople, said, mode } = s;
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
      /* Only a timed appointment that stands fixed is spoken in the four moments
         a sentence can be rewritten for. */
      draft.said = !whole && mode === "symbols" && Object.keys(said).length ? { ...said } : undefined;
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

  /* What the other half was holding, so that flipping can be flipped back.
     Going over used to drop the symbols on the spot and coming back found them
     gone; it is held here rather than thrown away, the way the two day edges hold
     the times they replace. */
  function flip(to: "symbols" | "choice") {
    if (s.mode === to) return;
    s.mode = to;
    if (to === "choice") { s.priorSymbols = draft.symbols; draft.symbols = []; draft.options = s.priorOptions; }
    else { s.priorOptions = draft.options; draft.options = []; draft.symbols = s.priorSymbols; }
  }

  /* The week's map only knows the symbols that were already on the board, so a
     symbol just picked out of the search has no picture in it and drew as its own
     label. What is picked here is resolved here — once per symbol, and kept. */
  let known = $state.raw(new Map(shown().pictures));
  $effect(() => {
    const missing = draft.symbols.filter(symbol => !pictureFor(known, symbol)).map(symbol => $state.snapshot(symbol));
    if (missing.length) void pictures(missing).then(found => { known = new Map([...known, ...found]); });
  });

  let named = $derived(draft.people.map(id => shown().people.find(person => person.id === id)?.name).filter(Boolean) as string[]);
  let peopleState = $derived(named.length ? named.join(", ") + (draft.showPeople ? " · auf der Karte" : "") : "niemand");

  /* A choice with one card is not a choice, and one with none is empty. A fixed
     appointment with no picture is the same kind of empty — with one exception: an
     all-day appointment carrying people and no picture is the visit, and the visit
     is *defined* by having no picture. Said once somebody pressed Fertig, not
     while the sheet is still being filled in. */
  let visiting = $derived(s.whole && draft.people.length > 0);
  let short = $derived(s.mode === "choice" && draft.options.length < 2);
  let bare = $derived(s.mode === "symbols" && !draft.symbols.length && !visiting);
  $effect(() => { s.canSave = !short && !bare; });
  let wantMore = $derived(bare
    ? "Noch ein Bild, sonst bleibt die Karte am Board leer."
    : "Wähl mindestens zwei Karten.");

  /* The word the four timed sentences are built around. The board draws pictures
     and never a title, so a title may carry what the child is not told; where an
     older record has a word of its own in `speech`, that word still stands.
     docs/speech.md. */
  const word = () => s.speech.trim() || s.title.trim() || cardSays(shown().cards.get(draft.chosen ?? "")) || "";
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
  let saidState = $derived.by(() => {
    const first = sayings?.summary() ?? "";
    return first ? `„${first}“` : "nichts";
  });

  /* The picture row and its chooser. Choosing closes the chooser; the same
     picture twice is one picture. */
  let picking = $state(false);
  const add = (ref: SymbolRef) => {
    if (!draft.symbols.some(symbol => symbol.source === ref.source && symbol.id === ref.id)) draft.symbols = [...draft.symbols, ref];
  };

  const togglePerson = (id: string) => {
    draft.people = draft.people.includes(id) ? draft.people.filter(other => other !== id) : [...draft.people, id];
  };

  async function erase() {
    if (draft.series) {
      const scope = await askScope("löschen", $state.snapshot(s.counts), { kind: s.shapeOfBatch() });
      if (!scope) return;
      if (scope !== "one") { const series = draft.series; return gone(() => dropSeries(series, scope === "from" ? s.anchor : undefined)); }
    } else {
      const sure = await confirmDialog({
        title: "Termin löschen", body: `„${titleOf(draft, shown().cards, shown().people) || "Dieser Termin"}“ am ${dayLabel(draft.date)} wird gelöscht.`,
        confirmLabel: "Löschen", danger: true,
      });
      if (!sure) return;
    }
    return gone(() => remove(draft.id));
  }
  async function gone(drop: () => Promise<unknown>) {
    s.erasing = true;
    try { await drop(); } finally { s.erasing = false; }
    handle.close();
    s.done();
  }

  async function save() {
    /* Rendered here rather than at the key press: planning is a moment somebody
       is already waiting through, and a child pressing a key is not. Not awaited
       — the sheet closes and the cache fills behind it. */
    void prepare(sayings?.sentences() ?? []);
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
        /* The move first, while the day still belongs to the batch it was opened
           in. „Ab hier" splits the batch, and a move written after the split
           would be told about the old half — whose rule no longer reaches the
           day it left — while the new half went on drawing it. Moved first, the
           day is already one the rule skips, and the split carries that across. */
        if (movedDay) await put(plain);
        await editSeries(plain.series, shape, scope === "from" ? s.anchor : undefined);
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
  }
  /* Handed to the foot, which is what presses them. Once, when the body is
     drawn, for the same reason `draft` is read once above. */
  untrack(() => { s.erase = erase; s.save = async () => { s.tried = true; if (s.canSave) await save(); }; });

  /* Making a card without leaving the appointment being planned. It ends by
     dropping the editor and letting the list draw again — with the new card
     already offered when there is one, which is the whole reason the button is here
     rather than in the settings. */
  async function madeCard(id: string | null) {
    s.making = false;
    if (id) { draft.options = [...draft.options, id]; await load(); }
  }
</script>

{#snippet own(symbol: SymbolRef)}<Picture {symbol} name={symbol.label} {known} />{/snippet}

<div class="stack">
  <When {s} />
  <section class="part part--bare" aria-label="Bilder">
    <div class="segmented"><button type="button" aria-pressed={s.mode === "symbols"} onclick={() => { flip("symbols"); s.making = false; }}>steht fest</button><button type="button" aria-pressed={s.mode === "choice"} onclick={() => { flip("choice"); picking = false; }}>wird ausgesucht</button></div>
    {#if s.mode === "symbols"}
      <div class="chosen"><TileGrid {@attach ordering}>{#each draft.symbols as symbol, index (symbol.source + symbol.id)}<div class="pic-slot" data-move=""><Tile label={symbol.label} aria-label={symbol.label} class="pic-tile" onclick={() => {}}>{@render own(symbol)}</Tile><button class="pic-x" type="button" aria-label="{symbol.label} entfernen" onclick={() => { draft.symbols = draft.symbols.filter((_, at) => at !== index); }}>×</button></div>{/each}<Tile label="Bild" aria-label="Bild hinzufügen" class="picker__item--add" active={picking} onclick={() => { picking = !picking; }}><span class="picker__add">＋</span></Tile></TileGrid></div>
      {#if picking}<PictureChooser seed={s.title.trim()} onpick={add} onclose={() => { picking = false; }} />{/if}
    {:else if s.making}
      <CardEditor card={{ id: uuid(), name: "", updatedAt: 0 }} done={id => void madeCard(id)} />
    {:else}
      <TileGrid>{#each draft.options as id (id)}<Tile label={cardById(id)?.name ?? "?"} toggle active={true} onclick={() => { draft.options = draft.options.filter(other => other !== id); }}><Picture symbol={cardById(id)?.symbol} name={cardById(id)?.name ?? "?"} /></Tile>{/each}{#each [...shown().cards.values()].filter(card => !draft.options.includes(card.id)) as card (card.id)}<Tile label={card.name} toggle active={false} onclick={() => { draft.options = [...draft.options, card.id]; }}><Picture symbol={card.symbol} name={card.name} /></Tile>{/each}<Tile label="Neue Karte" class="picker__item--add" onclick={() => { s.making = true; }}><span class="picker__add">＋</span></Tile></TileGrid>
    {/if}
    <p class="notice bad" hidden={!s.tried || (!short && !bare)}>{wantMore}</p>
  </section>
  <details class="more"><summary><span class="section">Wer ist dabei</span><span class="state">{peopleState}</span></summary><div class="stack fold"><TileGrid>{#each shown().people as person (person.id)}<Tile label={person.name} toggle active={draft.people.includes(person.id)} onclick={() => togglePerson(person.id)}><Face {person} /></Tile>{/each}</TileGrid>{#if !shown().people.length}<p class="small muted">Personen legst du in den Einstellungen an.</p>{/if}<label class="choice" hidden={!draft.people.length}><input type="checkbox" bind:checked={s.showPeople} /><span>Gesichter auf der Karte zeigen</span></label></div></details>
  <details class="more" bind:open={s.foldOpen}><summary><span class="section">Ansage</span><span class="state">{saidState}</span></summary><div class="stack fold"><Sayings bind:this={sayings} {s} {word} {shape} /></div></details>
</div>
