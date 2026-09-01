import "./style.css";
import { addDays, allDay, board, bornOn, dayLabel, daypartTimes, iso, minute, mondayOf, reading, shownCards, snapped, undecided, weekdays,
  type Appointment, type Card, type Person, type SymbolRef } from "./model.js";
import { allCards, allPeople, settings, week, whenStuck } from "./db.js";
import { owed, pictureFor, pictures, preferRendering, restore } from "./symbols.js";
import { announceAt } from "./speech.js";
import { el } from "./ui.js";

/* The board has no planning logic. It reads the week the calendar wrote and draws
   it; the only thing it would ever write is the option an input picked. */

const first = () => opens, span = () => closes - opens;
let opens = snapped(board.from), closes = snapped(board.to);
/* The configured window is a floor, not a frame: a week that starts earlier or ends
   later stretches it to the full hour, so an appointment can never fall outside the
   column. It is never made smaller, so the scale stays stable in a normal week. */
function scale(appointments: Appointment[]) {
  const times = appointments.filter(appointment => !allDay(appointment)).flatMap(appointment => [snapped(appointment.start!), snapped(appointment.end!)]);
  const from = snapped(board.from), to = snapped(board.to);
  const earliest = Math.min(from, ...times), latest = Math.max(to, ...times);
  opens = earliest < from ? Math.floor(earliest / 60) * 60 : from;
  closes = latest > to ? Math.ceil(latest / 60) * 60 : to;
}
const pos = (time: string) => ((snapped(time) - first()) / span()) * 100;
/* The rail reads the clock unsnapped, so its edge moves every minute rather than
   every grid step, and is clamped for times outside the day window. */
const reached = (time: string) => Math.max(0, Math.min(100, ((minute(time) - first()) / span()) * 100));

/* Overlapping appointments share the width of the day for as long as they run in
   parallel. Everything that overlaps directly or through a neighbour forms one
   cluster and is laid out over the same number of lanes. */
type Placed = { appointment: Appointment; top: number; height: number; lane: number; lanes: number };
function place(appointments: Appointment[]): Placed[] {
  const placed: Placed[] = [...appointments]
    .sort((a, b) => snapped(a.start!) - snapped(b.start!) || snapped(b.end!) - snapped(a.end!))
    .map(appointment => ({ appointment, top: pos(appointment.start!), height: pos(appointment.end!) - pos(appointment.start!), lane: 0, lanes: 1 }));
  let cluster: Placed[] = [], ends: number[] = [], clusterEnd = -Infinity;
  const close = () => {
    const lanes = cluster.reduce((most, item) => Math.max(most, item.lane + 1), 1);
    cluster.forEach(item => { item.lanes = lanes; });
    cluster = []; ends = []; clusterEnd = -Infinity;
  };
  placed.forEach(item => {
    const start = snapped(item.appointment.start!), end = snapped(item.appointment.end!);
    if (start >= clusterEnd) close();
    const free = ends.findIndex(taken => taken <= start);
    item.lane = free === -1 ? ends.length : free;
    ends[item.lane] = end;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, end);
  });
  close();
  return placed;
}

type Drawing = { urls: Map<string, string>; people: Map<string, Person>; cards: Map<string, Card>; now: string; todayIndex: number };
const escape = (text: string) => text.replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
function picture(draw: Drawing, ref: SymbolRef) {
  const url = pictureFor(draw.urls, ref);
  /* Without the household's folder there is no picture. The label is not for the
     child — it is what makes the setup state legible to whoever is fixing it. */
  return url ? `<img src="${url}" alt="" />` : `<span class="missing">${escape(ref.label)}</span>`;
}
const crown = `<svg class="crown" viewBox="0 0 24 15" aria-hidden="true"><path d="M1.5 13.5 3 2.5l5 4.5 4-6 4 6 5-4.5 1.5 11Z"/></svg>`;
function avatar(draw: Drawing, id: string, extra = "") {
  const person = draw.people.get(id);
  if (!person) return "";
  const inner = person.photo ? `<img src="${person.photo}" alt="" />` : `<b>${escape(person.initials)}</b>`;
  return `<span class="face" style="--tone:${person.tone}" title="${escape(person.name)}">${inner}${extra}</span>`;
}
function faces(draw: Drawing, ids: string[], date?: string) {
  /* Three avatars is what a narrow column can carry; the rest becomes a count. */
  const shown = ids.slice(0, 3), rest = ids.length - shown.length;
  const more = rest > 0 ? `<span class="face" style="--tone:#57504a"><b>+${rest}</b></span>` : "";
  return `<span class="faces">${shown.map(id => {
    /* A crown wherever the day is somebody's birthday — derived from the person,
       so no appointment has to carry a category. */
    const person = draw.people.get(id);
    return avatar(draw, id, date && person && bornOn(person, date) ? crown : "");
  }).join("")}${more}</span>`;
}

function card(draw: Drawing, { appointment, top, height, lane, lanes }: Placed) {
  const past = appointment.date === iso(new Date()) && appointment.end! <= draw.now;
  const current = appointment.date === iso(new Date()) && appointment.start! <= draw.now && draw.now < appointment.end!;
  const classes = ["card", past ? "past" : "", current ? "current" : "", undecided(appointment) ? "open" : "", lanes > 1 ? "parallel" : ""].filter(Boolean).join(" ");
  /* Parallel appointments are allowed to overlap a little rather than being cut
     into exact shares — two side by side stay wide enough to carry a symbol. */
  const width = lanes > 1 ? 100 / lanes + 22 / lanes : 100;
  const left = lanes > 1 ? (lane * (100 - width)) / (lanes - 1) : 0;
  const box = `top:${top}%;height:calc(${height}% - 5px);left:calc(${left}% + 3px);width:calc(${width}% - 6px);z-index:${1 + lane}`;
  const crowd = appointment.showPeople && appointment.people.length ? faces(draw, appointment.people) : "";
  /* An ordinary appointment shows its own symbols; a choice shows the cards it
     offers, or the one that was picked. */
  const shown: { symbol?: SymbolRef; name: string }[] = appointment.options.length
    ? shownCards(appointment).map(id => ({ symbol: draw.cards.get(id)?.symbol, name: draw.cards.get(id)?.name ?? "?" }))
    : appointment.symbols.map(symbol => ({ symbol, name: symbol.label }));
  const icons = shown.map(item => item.symbol
    ? `<span class="icon">${picture(draw, item.symbol)}</span>`
    : `<span class="icon"><span class="missing">${escape(item.name)}</span></span>`).join("");
  return `<div class="${classes}" style="${box}" data-id="${escape(appointment.id)}"><span class="icons">${icons}</span>${crowd}</div>`;
}

/* Everything that lasts all day sits at the top of the day rather than in the
   column, and each one is a single pill: the symbol it carries and, beside it,
   whom it concerns. One pill per appointment, so two of them stay countable the
   way two cards do — and a day fact with nobody on it is the same pill with the
   symbol alone. Visit and birthday are only two shapes of that, not two kinds of
   record. */
function whole(draw: Drawing, appointments: Appointment[], date: string) {
  const pills = appointments.map(appointment => {
    /* At most one picture: a row of symbols beside a row of avatars would be two
       lists in one pill, and the pill is too small to read as two. */
    const first = appointment.symbols[0] ?? shownCards(appointment).map(id => draw.cards.get(id)?.symbol).find(Boolean);
    const symbol = first ? `<span class="badge">${picture(draw, first)}</span>` : "";
    const crowd = appointment.people.length ? faces(draw, appointment.people, date) : "";
    return symbol || crowd ? `<span class="pill">${symbol}${crowd}</span>` : "";
  }).filter(Boolean);
  return pills.join("");
}

function column(draw: Drawing, date: string, index: number, appointments: Appointment[]) {
  const marks = whole(draw, appointments.filter(allDay), date);
  const today = index === draw.todayIndex;
  const state = today ? "today" : index < draw.todayIndex ? "gone" : "ahead";
  const time = today ? `<small>${draw.now}</small>` : "";
  return `<section class="day day-${index + 1} ${state}">
    <header><span class="name"><b>${weekdays[index]}</b><time>${dayLabel(date)}</time>${time}</span><span class="marks">${marks}</span></header>
    <div class="calendar"><div class="track">${place(appointments.filter(appointment => !allDay(appointment))).map(placed => card(draw, placed)).join("")}</div></div>
  </section>`;
}

/* The daypart rail is drawn, not photographed. The three sun marks follow the same
   dotted arc as the METACOM mittags/nachmittags symbols and differ only in where
   the sun stands on it, so the four marks read as one flat icon family and never
   compete with the appointment symbols. */
const sun = (cx: number, cy: number) => {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map(degree => {
    const angle = (degree * Math.PI) / 180, [dx, dy] = [Math.cos(angle), Math.sin(angle)];
    return `M${(cx + dx * 4.1).toFixed(1)} ${(cy + dy * 4.1).toFixed(1)}L${(cx + dx * 5.5).toFixed(1)} ${(cy + dy * 5.5).toFixed(1)}`;
  }).join("");
  return `<circle cx="${cx}" cy="${cy}" r="2.8" fill="currentColor" stroke="none"/><path d="${rays}" stroke-width="1.7"/>`;
};
const arc = `<path d="M4 20a8 8 0 0 1 16 0" stroke-dasharray="1.3 2.7" stroke-width="1.7" opacity=".8"/>`;
const glyph = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
/* The three sun marks and the moon, in the order of the times they belong to.
   Those times are the model's, because speech reads them too: a rail showing the
   evening moon while the button says Nachmittag is a disagreement that would only
   ever show up in front of the child. */
const daypartIcons = [
  glyph(arc + sun(5.8, 16.6)),
  glyph(arc + sun(12, 11.6)),
  glyph(arc + sun(18.2, 16.6)),
  glyph(`<path d="M20 15.4A8.4 8.4 0 0 1 8.6 4a7.4 7.4 0 1 0 11.4 11.4Z" fill="currentColor" stroke="none"/>`),
];
const dayparts = daypartTimes.map((at, index) => ({ at, icon: daypartIcons[index]! }));

/* The board is a projection of one moment against one week, so building it is one
   function of `at`. Nothing is cached between renders except the drawn glyphs. */
async function build(at: Date): Promise<string> {
  const monday = mondayOf(at);
  const dates = Array.from({ length: 7 }, (_, index) => iso(addDays(monday, index)));
  const [appointments, people, cardList] = await Promise.all([week(monday), allPeople(), allCards()]);
  const cards = new Map(cardList.map(card => [card.id, card]));
  scale(appointments);
  const urls = await pictures([
    ...appointments.flatMap(appointment => appointment.symbols),
    ...cardList.map(card => card.symbol).filter(Boolean) as SymbolRef[],
  ]);
  const draw: Drawing = { urls, people: new Map(people.map(person => [person.id, person])), cards, now: reading(at), todayIndex: (at.getDay() + 6) % 7 };

  const active = dayparts.filter(part => snapped(part.at) <= snapped(draw.now)).length - 1;
  const rail = `<aside class="rail day-${draw.todayIndex + 1}" aria-hidden="true" style="--now:${reached(draw.now)}%"><div class="rail-head"></div><div class="rail-track">
    ${dayparts.map((part, index) => `<span class="mark${index === active ? " is-now" : ""}" style="top:${pos(part.at)}%">${part.icon}</span>`).join("")}
  </div></aside>`;
  const track: string[] = dates.map((_, index) => (index === draw.todayIndex ? "var(--today)" : "var(--col)"));
  const cells: string[] = dates.map((date, index) => column(draw, date, index, appointments.filter(appointment => appointment.date === date)));
  track.splice(draw.todayIndex, 0, "var(--rail)");
  cells.splice(draw.todayIndex, 0, rail);
  if (!appointments.length) return `<p class="nothing">Diese Woche ist noch nichts geplant.<br /><small>Im Kalender anlegen — <code>${import.meta.env.BASE_URL}kalender.html</code></small></p>`;
  /* What ARASAAC's licence asks for is a notice beside the pictures, so it is asked
     of what this week actually draws rather than of everything the household owns.
     METACOM comes out of a folder the household licensed itself and owes nothing,
     so a board that draws from a connected folder carries no line at all. */
  const drawn: SymbolRef[] = [
    ...appointments.flatMap(appointment => appointment.symbols),
    ...appointments.flatMap(appointment => shownCards(appointment)).map(id => cards.get(id)?.symbol).filter(Boolean) as SymbolRef[],
  ];
  const credit = owed(drawn);
  return `<div class="week" style="grid-template-columns:${track.join(" ")}">${cells.join("")}</div>`
    + (credit.length ? `<p class="credit">${escape(credit.join(" "))}</p>` : "");
}

/* Redraw on every minute boundary rather than on an interval, so the board never
   drifts away from the wall clock and a resumed kiosk catches up immediately. The
   same tick re-reads the store, which is how a change made in the calendar arrives. */
const app = document.querySelector<HTMLElement>("#app")!;
async function tick() {
  const at = new Date();
  app.innerHTML = await build(at);
  light(lit);
  setTimeout(tick, 60_000 - (at.getSeconds() * 1000 + at.getMilliseconds()) + 20);
}

/* Whatever an announcement could not do, for whoever is setting the board up —
   never for the child, which is why it is small, in a corner, and says nothing
   at all when there is nothing wrong. It lives outside `#app` because the minute
   tick rewrites everything inside it. */
const setup = document.body.appendChild(el("p", { class: "setup" }));

/* Which card the voice is on. Held rather than only applied, because the board
   rewrites itself on every minute boundary and a sentence outlives that: without
   this the light would go out mid-word, at a moment that has nothing to do with
   the announcement. */
let lit: string | undefined;
function light(id?: string) {
  lit = id;
  for (const node of app.querySelectorAll(".card.saying")) node.classList.remove("saying");
  if (id) app.querySelector(`.card[data-id="${CSS.escape(id)}"]`)?.classList.add("saying");
}
const trouble = (words?: string) => { setup.textContent = words ?? ""; };
whenStuck(trouble);

/* The announcement is asked for, never volunteered. A key is what asks today:
   ADR 002 has the reader arriving as an ordinary USB keyboard that types a tag's
   UID, so a keypress is the door that input will come through as well, and the
   button in the frame is the same door with no card in front of it.

   Space, because a keypad or a single wired switch is what a button in a frame
   is, and space is what one of those sends before it is configured to send
   anything else. A modifier means somebody is at a real keyboard doing something
   else, so it is left alone. */
addEventListener("keydown", event => {
  if (event.code !== "Space" || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  event.preventDefault();
  /* Cleared before rather than after: a sentence takes seconds to speak, and a
     line about what went wrong last time is still on the wall for all of them. */
  trouble();
  void announceAt(new Date(), light).then(said => trouble(said.trouble));
});

await restore().catch(() => false);
/* The board resolves references rather than searching, but a reference whose
   qualified path no longer matches is looked up by name — and that lookup answers
   in index order unless it is told which fassung was meant. See `urlFor`. */
preferRendering((await settings()).metacomRendering ?? null);
void tick();
