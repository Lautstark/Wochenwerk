<script lang="ts">
  /* The week on the wall, drawn from `view.built`. Every mark on it is a
     class the stylesheet already knows; what changed in the move to Svelte is
     only that the markup is written once here rather than assembled into a
     string on every minute. */
  import { allDay, bornOn, dayLabel, drawnSymbols, iso, undecided, weekdays, type Appointment, type SymbolRef } from "../model.js";
  import { pictureFor } from "../symbols.js";
  import { crown, dayparts, place, pos, reached, type Built } from "./layout.js";
  import { flareLasts, view } from "./board.svelte.js";

  let built = $derived(view.built);

  /* Reads the moment-based marks again whenever `stamp` moves. */
  let flareLit = $derived.by(() => { void view.stamp; return Date.now() - view.taken.at < flareLasts; });

  const url = (b: Built, ref: SymbolRef) => pictureFor(b.urls, ref);

  /* Three avatars is what a narrow column can carry; the rest becomes a count. */
  const shownOf = (ids: string[]) => ({ shown: ids.slice(0, 3), rest: ids.length - Math.min(3, ids.length) });

  type Item = { symbol?: SymbolRef; name: string };
  const itemsOf = (b: Built, appointment: Appointment): Item[] =>
    drawnSymbols(appointment, b.cards).map(symbol => ({ symbol, name: symbol.label }));
  const offeredOf = (b: Built, appointment: Appointment) =>
    appointment.options.map(id => b.cards.get(id)?.symbol).filter(Boolean) as SymbolRef[];

  const past = (b: Built, a: Appointment) => a.date === iso(new Date()) && a.end! <= b.now;
  const current = (b: Built, a: Appointment) => a.date === iso(new Date()) && a.start! <= b.now && b.now < a.end!;

  /* Parallel appointments are allowed to overlap a little rather than being cut
     into exact shares — two side by side stay wide enough to carry a symbol. */
  const boxOf = ({ top, height, lane, lanes }: ReturnType<typeof place>[number]) => {
    const width = lanes > 1 ? 100 / lanes + 22 / lanes : 100;
    const left = lanes > 1 ? (lane * (100 - width)) / (lanes - 1) : 0;
    return `top:${top}%;height:calc(${height}% - 5px);left:calc(${left}% + 3px);width:calc(${width}% - 6px);z-index:${1 + lane}`;
  };

  const column = (b: Built, index: number) => index + 1 + (index >= b.todayIndex ? 1 : 0);
  let lanes = $derived(built?.runs.length ? Math.max(...built.runs.map(run => run.lane)) + 1 : 0);
  let grown = $derived(lanes ? ` --band:${(lanes * 1.95 + 0.3).toFixed(2)}rem; --head:calc(var(--head-day) + var(--band))` : "");
</script>

{#snippet picture(b: Built, ref: SymbolRef)}
  {@const src = url(b, ref)}
  {#if src}<img {src} alt="" />{:else}<span class="missing">{ref.label}</span>{/if}
{/snippet}

{#snippet avatar(b: Built, id: string, crowned: boolean)}
  {@const person = b.people.get(id)}
  {#if person}<span class="face" style="--tone:{person.tone}" title={person.name}>{#if person.photo}<img src={person.photo} alt="" />{:else}<b>{person.initials}</b>{/if}{#if crowned}{@html crown}{/if}</span>{/if}
{/snippet}

{#snippet faces(b: Built, ids: string[], date?: string)}
  {@const { shown, rest } = shownOf(ids)}
  <span class="faces">{#each shown as id}{@const person = b.people.get(id)}{@render avatar(b, id, !!(date && person && bornOn(person, date)))}{/each}{#if rest > 0}<span class="face" style="--tone:#57504a"><b>+{rest}</b></span>{/if}</span>
{/snippet}

{#snippet card(b: Built, placed: ReturnType<typeof place>[number])}
  {@const a = placed.appointment}
  {@const offered = offeredOf(b, a)}
  <div class={["card", past(b, a) ? "past" : "", current(b, a) ? "current" : "", undecided(a) ? "open" : "", placed.lanes > 1 ? "parallel" : "", view.lit === a.id ? "saying" : ""].filter(Boolean).join(" ")}
       style={boxOf(placed)} data-id={a.id}><span class="icons">{#if undecided(a)}<span class="ask" aria-hidden="true">?</span><span class="offers" style="--count:{Math.max(1, offered.length)}">{#each offered as symbol}<span class="icon">{@render picture(b, symbol)}</span>{/each}</span>{:else}{#each itemsOf(b, a) as item}<span class="icon">{#if item.symbol}{@render picture(b, item.symbol)}{:else}<span class="missing">{item.name}</span>{/if}</span>{/each}{/if}</span>{#if a.showPeople && a.people.length}{@render faces(b, a.people)}{/if}</div>
{/snippet}

{#if built}
  {@const b = built}
  {#if !b.appointments.length}
    <p class="nothing">Diese Woche ist noch nichts geplant.<br /><small>Im Kalender anlegen — <code>{import.meta.env.BASE_URL}kalender</code></small></p>
  {:else}
    <div class="week" style="grid-template-columns:{b.track.join(" ")};{grown}">
      {#each b.dates as date, index}
        {#if index === b.todayIndex}
          <aside class="rail day-{b.todayIndex + 1}" aria-hidden="true" style="--now:{reached(b.now)}"><div class="rail-head"></div><div class="rail-track">
            {#each dayparts as part, at}<span class="mark{at === b.active ? " is-now" : ""}" style="top:{pos(part.at)}%">{@html part.icon}</span>{/each}
          </div></aside>
        {/if}
        {@const own = b.appointments.filter(appointment => appointment.date === date)}
        {@const today = index === b.todayIndex}
        <section class="day day-{index + 1} {today ? "today" : index < b.todayIndex ? "gone" : "ahead"}" data-date={date} style={today ? `--now:${reached(b.now)}` : undefined}>
          <header><span class="name"><b>{weekdays[index]}</b><time>{dayLabel(date)}</time>{#if today}<small>{b.now}</small>{/if}</span><span class="marks">{#each own.filter(item => allDay(item) && b.birthday(item)) as appointment}{@const first = drawnSymbols(appointment, b.cards)[0]}{#if first || appointment.people.length}<span class="pill">{#if first}<span class="badge">{@render picture(b, first)}</span>{/if}{#if appointment.people.length}{@render faces(b, appointment.people, date)}{/if}</span>{/if}{/each}</span></header>
          <div class="calendar"><div class="track">{#each place(own.filter(appointment => !allDay(appointment))) as placed (placed.appointment.id)}{@render card(b, placed)}{/each}</div></div>
        </section>
      {/each}
      {#if b.runs.length}
        <div class="band" style="grid-template-columns:{b.track.join(" ")}">
          {#each b.runs as run}
            {@const first = column(b, b.dates.indexOf(run.days[0]))}
            {@const last = column(b, b.dates.indexOf(run.days[run.days.length - 1]))}
            {@const symbol = drawnSymbols(run.appointment, b.cards)[0]}
            {@const over = run.days[run.days.length - 1] < b.dates[b.todayIndex]}
            {@const todayColumn = column(b, b.todayIndex)}
            {@const cut = todayColumn > first && todayColumn <= last ? todayColumn - first + 1 : 0}
            <div class="span{run.before ? " span--from" : ""}{run.after ? " span--into" : ""}{over ? " gone" : ""}" style="grid-column:{first} / span {last - first + 1}; grid-row:{run.lane + 1}">
              <span class="span__what">
                {#if symbol}<span class="badge">{@render picture(b, symbol)}</span>{/if}
                {#if run.appointment.people.length}{@render faces(b, run.appointment.people, run.days[0])}{/if}
              </span>
              {#if cut}<i class="span__gone" style="grid-column:1 / {cut}"></i>{/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  {@const open = b.open}
  {@const offered = open ? offeredOf(b, open) : []}
  <div class="slotbar{open ? ` day-${b.dates.indexOf(open.date) + 1}` : ""}{view.wrong ? " wrong" : ""}" data-open={open?.id}>{#if view.readerGone || b.credit}<span class="notes">{#if view.readerGone}<span class="fault">Kartenleser antwortet nicht</span>{/if}{#if b.credit}<span class="credit">{b.credit}</span>{/if}</span>{/if}{#if open}
    <div class="offerbox" style="--count:{Math.max(1, offered.length)}"><span class="query" aria-hidden="true">?</span>{#each offered as symbol}<span class="pick">{@render picture(b, symbol)}</span>{/each}</div>{/if}{#if flareLit}<span class="taken day-{view.taken.day}{view.taken.back ? " back" : ""}"></span>{/if}
  </div>
{/if}
