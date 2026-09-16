<script lang="ts">
  /* The week as a calendar: hours down the side, a column per day, what lasts all
     day in a row of its own. What differs between entries is not which activity
     they hold — the name says that — but what kind of entry they are, and there are
     three of those which combine. Three marks, because a colour cannot say two
     things at once. */
  import { allDay, board, bornOn, clock, drawnSymbols, iso, lanesOf, runsOf, snapped, titleOf, undecided,
    weekdays, type Appointment } from "../model.js";
  import { personById, shown } from "../store.svelte.js";
  import Face from "../pieces/Face.svelte";
  import Picture from "../pieces/Picture.svelte";

  const HOUR = 46;
  let { visible = null, onopen, oncreate }: {
    /* Which of the week's days are drawn. Seven of them side by side needs width
       nobody has on a phone, so a narrow screen shows the one day being looked at
       and the same grid draws it. */
    visible?: string[] | null;
    onopen: (appointment: Appointment) => void;
    oncreate: (date: string, start?: string) => void;
  } = $props();

  let current = $derived(shown());
  let days = $derived(visible ?? current.dates);
  let today = $derived(iso(new Date()));
  let at = $derived.by(() => { const now = new Date(); return now.getHours() * 60 + now.getMinutes(); });
  let span = $derived.by(() => {
    const times = current.appointments.filter(item => !allDay(item)).flatMap(item => [snapped(item.start!), snapped(item.end!)]);
    return {
      from: Math.floor(Math.min(snapped(board.from), ...times) / 60) * 60,
      to: Math.ceil(Math.max(snapped(board.to), ...times) / 60) * 60,
    };
  });
  let hours = $derived(Array.from({ length: (span.to - span.from) / 60 }, (_, index) => span.from + index * 60));
  /* Ganztägiges is a band of stretches, not a cell per day: three days of one
     visit are one bar, written once. The rules underneath stay a cell each,
     because clicking an empty day is still how a day gets an appointment. */
  let runs = $derived(runsOf(current.appointments, days, current.series));
  let lanes = $derived(runs.length ? Math.max(...runs.map(run => run.lane)) + 1 : 1);

  const kindOf = (appointment: Appointment) =>
    [appointment.series ? "" : "once", undecided(appointment) ? "choice" : ""].filter(Boolean).join(" ");

  function pressedColumn(event: MouseEvent, date: string) {
    if (event.target !== event.currentTarget) return;
    const minutes = Math.round((span.from + (event.offsetY / HOUR) * 60) / board.snap) * board.snap;
    oncreate(date, clock(Math.min(minutes, span.to - board.snap)));
  }
</script>

<div class="cal" style="--days:{days.length}">
  <div class="cal__head"><div class="cal__corner"></div>{#each days as date}<div class="cal__day{date === today ? " cal__day--today" : ""}"><b>{weekdays[current.dates.indexOf(date)]}</b><span>{String(Number(date.slice(8)))}</span></div>{/each}</div>
  <div class="cal__whole" style="--lanes:{lanes}"><div class="cal__corner">ganztags</div>{#each days as date, index}<div class="cal__whole-rule" style="grid-column: {index + 2}" onclick={event => { if (event.target === event.currentTarget) oncreate(date); }}></div>{/each}{#each runs as run}{@const item = run.appointment}{@const first = drawnSymbols(item, current.cards)[0]}<button class={`whole ${kindOf(item)}${run.before ? " whole--from" : ""}${run.after ? " whole--into" : ""}`.replace(/\s+/g, " ").trim()} type="button" style="grid-column: {days.indexOf(run.days[0]) + 2} / span {run.days.length}; grid-row: {run.lane + 1}" onclick={() => onopen(item)}>{#if first}<Picture symbol={first} name={first.label} />{/if}<span class="whole__name">{titleOf(item, current.cards, current.people) || "Ganztägig"}</span>{#if item.people.length}<span class="whole__who">{#each item.people.slice(0, 3) as id}{@const person = personById(id)}<span class="whole__face"><Face {person} size="sm" />{#if person && bornOn(person, run.days[0])}<span class="crown">👑</span>{/if}</span>{/each}</span>{/if}</button>{/each}</div>
  <div class="cal__body"><div class="cal__gutter">{#each hours as hour}<div class="cal__hour" style="height: {HOUR}px"><span>{clock(hour)}</span></div>{/each}</div>{#each days as date}<div class="cal__col{date === today ? " cal__col--today" : ""}" style="height: {((span.to - span.from) / 60) * HOUR}px" onclick={event => pressedColumn(event, date)}>{#each hours as _, index}<div class="cal__rule" style="top: {index * HOUR}px"></div>{/each}{#if date === today && at >= span.from && at <= span.to}<div class="cal__now" style="top: {((at - span.from) / 60) * HOUR}px"></div>{/if}{#each lanesOf(current.appointments.filter(item => item.date === date && !allDay(item))) as { appointment, lane, lanes }}{@const top = ((snapped(appointment.start!) - span.from) / 60) * HOUR}{@const tall = Math.max(26, ((snapped(appointment.end!) - snapped(appointment.start!)) / 60) * HOUR)}{@const name = titleOf(appointment, current.cards, current.people) || (undecided(appointment) ? "Auswahl" : "Termin")}{@const width = 100 / lanes}<button class={`event ${kindOf(appointment)}${tall < 40 ? " event--tight" : ""}`.trim()} type="button" title="{name} · {appointment.start}–{appointment.end}" style="top: {top}px; height: {tall - 2}px; left: calc({lane * width}% + 2px); width: calc({width}% - 4px)" onclick={() => onopen(appointment)}><span class="event__name">{name}</span><span class="event__who">{#each appointment.people as id}<Face person={personById(id)} size="sm" />{/each}</span></button>{/each}</div>{/each}</div>
</div>
