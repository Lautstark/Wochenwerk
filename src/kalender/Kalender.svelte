<script lang="ts">
  /* The route, and only the route: what is on screen comes from the store, what is
     drawn comes from the views, and what is kept comes from the database. */
  import { announcer } from "@lautstark/design/toast";
  import Footer from "@lautstark/design/svelte/Footer";
  import Legal from "./Legal.svelte";
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

  /* Which legal page is open, or nothing. Held here rather than in a module,
     because the footer that opens it and the dialog that draws it are both in
     this file and nothing else on the page asks. */
  let legal = $state<string | null>(null);
</script>

<div class="shell">
  <header class="topbar">
    <div class="topbar__nav"><button class="btn quiet icon" type="button" onclick={() => void step(-1)}>‹</button><button class="btn quiet icon" type="button" onclick={() => void step(1)}>›</button><button class="btn quiet sm" type="button" onclick={() => void step(0)}>Heute</button><b>{label}</b></div>
    <div class="topbar__nav"><a class="btn quiet sm" href={import.meta.env.BASE_URL} target="_blank" rel="noopener">Symbolansicht ↗</a><button class="btn quiet sm" type="button" onclick={() => openSettings(say)}>Einstellungen</button><button class="btn primary sm" type="button" onclick={() => editAppointment(blankAppointment(dayInView()), false, reload)}>＋ Termin</button></div>
  </header>
  <!-- The page's work, and the only element on it that is. The mount point used
       to be the `<main>` and everything was inside it, including what is now the
       footer; a `<footer>` inside `<main>` is not `contentinfo`, and the landmark
       is what the shared footer is. So `main` narrowed to the thing a reader
       would skip to, which is the week and the line that stands in for it while
       there is none. -->
  <main class="work">
    <!-- `.notice` is the outcome line — what happened after something was done, and it
         holds until something replaces it. A week nobody has planned yet is not an
         outcome; it is the empty state, and components.css has one of those with a
         heading and a hint under it. -->
    <p class="empty" hidden={current.appointments.length > 0}><b>Noch nichts geplant</b><small>Leg den ersten Termin an — oder klick in eine Spalte.</small></p>
    <WeekGrid visible={narrow ? [current.dates[day]!] : null}
      onopen={appointment => editAppointment(appointment, true, reload)}
      oncreate={(date, start) => editAppointment(blankAppointment(date, start), false, reload)} />
  </main>
  <!--
    The status line, and it is no longer a `<footer>`.

    It was one, and it held two things that turned out to be two different kinds
    of statement. `.line` is what the page says out loud after something was
    done — §3.8 — and it is a live region that has to stay in the document
    whether or not it has anything to say. That is not footer content, and it
    must not be set in the footer's 11.5px faint centred type.

    The attribution is the other half, and it *is* footer content: it is a
    licence condition that follows the symbols this week draws, which is
    §6.12's `credit` prop in as many words. So it moves down into the shared
    footer and this row keeps the one sentence that is a status.

    A `<div>` rather than a `<footer>` because there is a real `<footer>` under
    it now. Both are children of `.shell`, which is not sectioning content, so
    two of them would be two `contentinfo` landmarks on one page.
  -->
  <div class="pagefoot"><p bind:this={line} class="line" role="status"></p></div>
  <!--
    The foot of the page. `@lautstark/design/svelte/Footer` — §6.12: the shell is
    shared and every word in it is this product's, arriving as children in this
    product's order.

    The links are not wrapped, which is the component's rule and the reason it
    has none of its own: `text-align: center` and the word space between them do
    the work. Three buttons, because what they open is a dialog in this page and
    not another document, and a link that goes nowhere offers a new tab and a
    copied address that lead somewhere else. The fourth is a real anchor, and it
    is the only one.
  -->
  <Footer {credit}>
    <button class="linklike" type="button" onclick={() => { legal = "about"; }}>Über Wochenwerk</button>
    <!-- Both of these have to be reachable from every screen and to be called
         exactly this. „Kontakt", or a paragraph inside the about page, would
         not count as either. -->
    <button class="linklike" type="button" onclick={() => { legal = "impressum"; }}>Impressum</button>
    <button class="linklike" type="button" onclick={() => { legal = "privacy"; }}>Datenschutz</button>
    <a href="https://github.com/Lautstark/Wochenwerk" target="_blank" rel="noreferrer noopener">Quellcode</a>
  </Footer>
</div>
<Legal bind:page={legal} />
