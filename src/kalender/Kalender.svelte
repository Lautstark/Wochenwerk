<script lang="ts">
  /* The route, and only the route: what is on screen comes from the store, what is
     drawn comes from the views, and what is kept comes from the database. */
  import { announcer } from "@lautstark/design/toast";
  import { addDays, dayLabel, drawnSymbols, iso, weekdays, type SymbolRef } from "../model.js";
  import { load, shown, type Week } from "../store.svelte.js";
  import { owed } from "../symbols.js";
  import WeekGrid from "./WeekGrid.svelte";
  import { blankAppointment, editAppointment } from "./appointment.svelte.js";
  import { openSettings } from "./settings.svelte.js";

  let line: HTMLElement;
  let talk: ReturnType<typeof announcer> | undefined;
  $effect(() => { talk = announcer(line, { rest: 4000, onRest: node => { node.textContent = ""; } }); });
  const say = (text: string) => { talk?.say(text); };

  let current = $derived(shown());
  /* ARASAAC's licence is a condition on showing its pictures, so the notice is asked
     of the symbols this week draws — not of the collection the household happens to
     be searching in. A week drawn from the household's own METACOM folder owes
     nothing and leaves the line empty. */
  const drawn = (week: Week): SymbolRef[] => [
    ...week.appointments.flatMap(appointment => appointment.symbols),
    ...week.appointments.flatMap(item => drawnSymbols(item, week.cards)),
  ];
  let credit = $derived(owed(drawn(current)).join(" "));

  /* A phone has no room for seven columns, so it shows the day being looked at and
     the arrows walk days instead of weeks — across a week boundary when they run
     off the end. */
  const query = matchMedia("(max-width: 700px)");
  let narrow = $state(query.matches);
  query.addEventListener("change", () => { narrow = query.matches; });
  let day = $state((new Date().getDay() + 6) % 7);

  let label = $derived(narrow
    ? `${weekdays[day]} ${dayLabel(current.dates[day])}`
    : `${dayLabel(iso(current.monday))} – ${dayLabel(iso(addDays(current.monday, 6)))} ${current.monday.getFullYear()}`);

  async function step(by: number) {
    if (by === 0) { day = (new Date().getDay() + 6) % 7; await load(0); return; }
    if (!narrow) return void load(current.offset + by);
    const next = day + by;
    if (next < 0 || next > 6) { day = next < 0 ? 6 : 0; await load(current.offset + by); return; }
    day = next;
  }

  /* Anlegen was a thing you had to already know: a click into a column, taught by
     the empty state and only by it — so the lesson disappeared with the first
     appointment, which is when somebody starts needing it. On a tablet there is no
     `cursor: crosshair` to hint at it either. The click stays as the quicker way in;
     this is the way in that is visible. Which day it opens is the day being looked
     at: the shown one on a phone, otherwise today when today is in the week, and
     the week's Monday when it is not — never a day off screen. */
  function dayInView(): string {
    if (narrow) return current.dates[day]!;
    const today = iso(new Date());
    return current.dates.includes(today) ? today : current.dates[0]!;
  }
  const reload = () => void load();
</script>

<div class="shell">
  <header class="topbar">
    <div class="topbar__nav"><button class="btn quiet icon" type="button" onclick={() => void step(-1)}>‹</button><button class="btn quiet icon" type="button" onclick={() => void step(1)}>›</button><button class="btn quiet sm" type="button" onclick={() => void step(0)}>Heute</button><b>{label}</b></div>
    <div class="topbar__nav"><a class="btn quiet sm" href={import.meta.env.BASE_URL} target="_blank" rel="noopener">Symbolansicht ↗</a><button class="btn quiet sm" type="button" onclick={() => openSettings(say)}>Einstellungen</button><button class="btn primary sm" type="button" onclick={() => editAppointment(blankAppointment(dayInView()), false, reload)}>＋ Termin</button></div>
  </header>
  <!-- `.notice` is the outcome line — what happened after something was done, and it
       holds until something replaces it. A week nobody has planned yet is not an
       outcome; it is the empty state, and components.css has one of those with a
       heading and a hint under it. -->
  <p class="empty" hidden={current.appointments.length > 0}><b>Noch nichts geplant</b><small>Leg den ersten Termin an — oder klick in eine Spalte.</small></p>
  <WeekGrid visible={narrow ? [current.dates[day]!] : null}
    onopen={appointment => editAppointment(appointment, true, reload)}
    oncreate={(date, start) => editAppointment(blankAppointment(date, start), false, reload)} />
  <footer class="pagefoot"><p bind:this={line} class="line" role="status"></p><p class="credit">{credit}</p></footer>
</div>
