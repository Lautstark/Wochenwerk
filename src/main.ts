import "./style.css";
/* Vollbild and staying lit: the screen the week is on, which is not the week. */
import "./screen.js";
import { addDays, allDay, birthdayName, board, bornOn, dayLabel, daypartTimes, iso, minute, mondayOf, reading, drawnSymbols, runsOf, snapped, undecided, weekdays,
  type Appointment, type Card, type Person, type SymbolRef } from "./model.js";
import { allCards, allPeople, allSeries, pullFromFolder, put, settings, week, whenStuck } from "./db.js";
import { ablage, adopted, watchFolder } from "./folder.js";
import { owed, pictureFor, pictures, preferRendering, restore } from "./symbols.js";
import { listen } from "./reader.js";
import { announceAt, preview } from "./speech.js";
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
/* How far the day has come, as a bare number of percent: the rail draws its edge
   from it, and today's own field draws the same edge from the same number, so the
   two can never disagree about where now is. Read unsnapped, so the edge moves every
   minute rather than every grid step, and clamped for times outside the day window. */
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

type Drawing = { urls: Map<string, string>; people: Map<string, Person>; cards: Map<string, Card>; now: string; todayIndex: number;
  /* A birthday stays in the head as the face it always was; everything else
     all-day moved down into the band. The board asks this rather than working it
     out twice. */
  birthday: (appointment: Appointment) => boolean };
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
  /* Its own symbol, until something picked — then the picked card's. An open
     choice draws one sign meaning *here you choose* rather than a row of the
     options; see `drawnSymbols`. */
  const shown = drawnSymbols(appointment, draw.cards).map(symbol => ({ symbol, name: symbol.label }));
  const drawn = (item: { symbol?: SymbolRef; name: string }) => item.symbol
    ? `<span class="icon">${picture(draw, item.symbol)}</span>`
    : `<span class="icon"><span class="missing">${escape(item.name)}</span></span>`;
  /* An open choice is a question mark, and under it, small and muted, the cards
     that answer it. The mark is the sign to learn — one shape, the day's own ink,
     and drawn rather than fetched so the day can colour it. The row beneath is
     what is lying on the table, quiet enough that nobody mistakes it for what is
     happening: these are not two appointments, they are two answers nobody has
     given yet. */
  const offered = appointment.options.map(id => draw.cards.get(id)?.symbol).filter(Boolean) as SymbolRef[];
  /* How many stand side by side, handed to the stylesheet: the row's share of a
     card is the card's width divided by them, and only this side knows the
     divisor. */
  const icons = undecided(appointment)
    ? `<span class="ask" aria-hidden="true">?</span><span class="offers" style="--count:${Math.max(1, offered.length)}">`
      + offered.map(symbol => `<span class="icon">${picture(draw, symbol)}</span>`).join("")
      + `</span>`
    : shown.map(drawn).join("");
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
    const first = drawnSymbols(appointment, draw.cards)[0];
    const symbol = first ? `<span class="badge">${picture(draw, first)}</span>` : "";
    const crowd = appointment.people.length ? faces(draw, appointment.people, date) : "";
    return symbol || crowd ? `<span class="pill">${symbol}${crowd}</span>` : "";
  }).filter(Boolean);
  return pills.join("");
}

function column(draw: Drawing, date: string, index: number, appointments: Appointment[]) {
  const marks = whole(draw, appointments.filter(item => allDay(item) && draw.birthday(item)), date);
  const today = index === draw.todayIndex;
  const state = today ? "today" : index < draw.todayIndex ? "gone" : "ahead";
  const time = today ? `<small>${draw.now}</small>` : "";
  /* Only today fades: for a day that is over or still ahead the question the
     gradient answers has one fixed answer, and a fade would claim a part-way state
     that day is not in. */
  const reach = today ? ` style="--now:${reached(draw.now)}"` : "";
  return `<section class="day day-${index + 1} ${state}" data-date="${escape(date)}"${reach}>
    <header><span class="name"><b>${weekdays[index]}</b><time>${dayLabel(date)}</time>${time}</span><span class="marks">${marks}</span></header>
    <div class="calendar"><div class="track">${place(appointments.filter(appointment => !allDay(appointment))).map(placed => card(draw, placed)).join("")}</div></div>
  </section>`;
}

/* What the slot bar carries: the next undecided choice whose day is today or
   tomorrow. Never one further off — a question pointed at the slot is an invitation
   to put a card in, and on Friday morning that invitation would be wrong about
   Sunday. The calendar day is the boundary rather than twenty-four hours, because a
   day turns at midnight and unwatched, where a rolling window would make the bar
   fill up in the middle of an afternoon for no reason anybody in the room can see.

   One at a time, and today's before tomorrow's: two boxes would need two arrows,
   and the second question is not being asked yet. A choice whose time is already
   over is left out — it was not answered, and pointing at the slot will not change
   that. */
function pending(appointments: Appointment[], today: string, tomorrow: string, now: string) {
  return appointments
    .filter(appointment => undecided(appointment) && (appointment.date === today || appointment.date === tomorrow))
    .filter(appointment => appointment.date !== today || allDay(appointment) || appointment.end! > now)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""))[0];
}

/* The bar itself: an own row under the week, always there and usually empty.
   Always, because a strip that appears with the question would move the whole week
   up and down over the course of a day; and empty in the frame's own black, so that
   nothing on it is the absence of a question rather than a thing in its own right.

   Where there is a question it carries the cards that answer it, standing over the
   slot in the frame below. The slot is built into one place and never moves, so the
   place on screen where the answer stands may not move either: that constancy is
   half of what a child learns here, and a row that put the cards under their own day
   would teach an address that does not exist in the room.

   Which day is being decided is carried by nothing but colour: the tray is a plate
   of that day's own colour, and no two columns share one. A line would have had to
   cross half the board, and where the day is the one the slot already stands under
   it would have had nothing to cross at all — so there is no line, and no second
   mark at the day's end of it either. The week is already a row of colours; this is
   one more of them, standing where the card goes. */
function slotbar(draw: Drawing, dates: string[], credit: string, open?: Appointment) {
  /* The left end of the bar is where the device talks about itself: a fault in the
     frame, and the notice ARASAAC's licence asks for. Both are for whoever set the
     board up and neither is for the child, so both are small, grey and as far from
     the question as this row is wide. The notice used to be fixed to the corner of
     the week, from before this row existed; there it now sat under the box.

     The fault line is the more urgent of the two and goes on top.

     And for a moment after a card came or went, the flare over the slot. It is drawn
     here rather than at the card, because it is about the place: the tray that stood
     over the slot has just appeared or gone, and this says why. */
  const lit = Date.now() - takenAt < flareLasts
    ? `<span class="taken day-${takenDay}${takenBack ? " back" : ""}"></span>` : "";
  const notes = [
    readerGone ? `<span class="fault">Kartenleser antwortet nicht</span>` : "",
    credit ? `<span class="credit">${escape(credit)}</span>` : "",
  ].filter(Boolean).join("");
  const said = notes ? `<span class="notes">${notes}</span>` : "";
  if (!open) return `<div class="slotbar">${said}${lit}</div>`;
  const index = dates.indexOf(open.date);
  const offered = open.options.map(id => draw.cards.get(id)?.symbol).filter(Boolean) as SymbolRef[];
  const picks = offered.map(symbol => `<span class="pick">${picture(draw, symbol)}</span>`).join("");
  return `<div class="slotbar day-${index + 1}" data-open="${escape(open.id)}">${said}
    <div class="offerbox" style="--count:${Math.max(1, offered.length)}"><span class="query" aria-hidden="true">?</span>${picks}</div>${lit}
  </div>`;
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
  const [appointments, people, cardList, seriesList] = await Promise.all([week(monday), allPeople(), allCards(), allSeries()]);
  const cards = new Map(cardList.map(card => [card.id, card]));
  scale(appointments);
  const urls = await pictures([
    ...appointments.flatMap(appointment => appointment.symbols),
    ...cardList.map(card => card.symbol).filter(Boolean) as SymbolRef[],
  ]);
  const draw: Drawing = { urls, people: new Map(people.map(person => [person.id, person])), cards,
    now: reading(at), todayIndex: (at.getDay() + 6) % 7,
    birthday: appointment => !!birthdayName(appointment, people) };

  const active = dayparts.filter(part => snapped(part.at) <= snapped(draw.now)).length - 1;
  const rail = `<aside class="rail day-${draw.todayIndex + 1}" aria-hidden="true" style="--now:${reached(draw.now)}"><div class="rail-head"></div><div class="rail-track">
    ${dayparts.map((part, index) => `<span class="mark${index === active ? " is-now" : ""}" style="top:${pos(part.at)}%">${part.icon}</span>`).join("")}
  </div></aside>`;
  const track: string[] = dates.map((_, index) => (index === draw.todayIndex ? "var(--today)" : "var(--col)"));
  const cells: string[] = dates.map((date, index) => column(draw, date, index, appointments.filter(appointment => appointment.date === date)));
  track.splice(draw.todayIndex, 0, "var(--rail)");
  cells.splice(draw.todayIndex, 0, rail);
  /* Tomorrow is read out of the week on screen, so on a Sunday the bar has nothing
     to show for the Monday that follows: that Monday belongs to the next week and
     was never loaded. */
  /* What ARASAAC's licence asks for is a notice beside the pictures, so it is asked
     of what this week actually draws rather than of everything the household owns.
     METACOM comes out of a folder the household licensed itself and owes nothing,
     so a board that draws from a connected folder carries no line at all. */
  const drawn: SymbolRef[] = [
    ...appointments.flatMap(appointment => appointment.symbols),
    ...appointments.flatMap(appointment => drawnSymbols(appointment, cards)),
    /* An open choice draws the cards it offers, small, under its question mark. */
    ...appointments.flatMap(appointment => appointment.options).map(id => cards.get(id)?.symbol).filter(Boolean) as SymbolRef[],
  ];
  const bar = slotbar(draw, dates, owed(drawn).join(" "),
    pending(appointments, iso(at), iso(addDays(at, 1)), draw.now));
  if (!appointments.length) return `<p class="nothing">Diese Woche ist noch nichts geplant.<br /><small>Im Kalender anlegen — <code>${import.meta.env.BASE_URL}kalender.html</code></small></p>${bar}`;
  /* One bar per stretch, laid over the week. The rail sits inside the grid as a
     column of its own, so a stretch that crosses today crosses it too — which is
     what a stretch does. */
  /* The board says everything in pictures. A stretch carrying neither a picture
     nor a person has nothing to say here and is left to the calendar — the same
     rule the head's pills have always followed. */
  const runs = runsOf(appointments, dates, new Map(seriesList.map(item => [item.id, item])))
    .filter(run => !draw.birthday(run.appointment))
    .filter(run => drawnSymbols(run.appointment, cards).length || run.appointment.people.length);
  const column_ = (index: number) => index + 1 + (index >= draw.todayIndex ? 1 : 0);
  const todayColumn = column_(draw.todayIndex);
  const lanes = runs.length ? Math.max(...runs.map(run => run.lane)) + 1 : 0;
  const band = !runs.length ? "" : `<div class="band" style="grid-template-columns:${track.join(" ")}">
    ${runs.map(run => {
      const first = column_(dates.indexOf(run.days[0])), last = column_(dates.indexOf(run.days[run.days.length - 1]));
      const symbol = drawnSymbols(run.appointment, cards)[0];
      const over = run.days[run.days.length - 1] < dates[draw.todayIndex];
      /* Where today falls inside the stretch, counted in the bar's own columns —
         the bar borrows the week's tracks, so the boundary is a grid line and
         never a percentage along a bar whose days are not equally wide. */
      const cut = todayColumn > first && todayColumn <= last ? todayColumn - first + 1 : 0;
      return `<div class="span${run.before ? " span--from" : ""}${run.after ? " span--into" : ""}${over ? " gone" : ""}"
        style="grid-column:${first} / span ${last - first + 1}; grid-row:${run.lane + 1}">
        <span class="span__what">
          ${symbol ? `<span class="badge">${picture(draw, symbol)}</span>` : ""}
          ${run.appointment.people.length ? faces(draw, run.appointment.people, run.days[0]) : ""}
        </span>
        ${cut ? `<i class="span__gone" style="grid-column:1 / ${cut}"></i>` : ""}
      </div>`;
    }).join("")}
    </div>`;
  const grown = lanes ? ` --band:${(lanes * 1.95 + 0.3).toFixed(2)}rem; --head:calc(var(--head-day) + var(--band))` : "";
  return `<div class="week" style="grid-template-columns:${track.join(" ")};${grown}">${cells.join("")}${band}</div>${bar}`;
}

/* Redraw on every minute boundary rather than on an interval, so the board never
   drifts away from the wall clock and a resumed kiosk catches up immediately. The
   same tick re-reads the store, which is how a change made in the calendar arrives. */
const app = document.querySelector<HTMLElement>("#app")!;


/* A card that answers nothing: nothing is saved, and the refusal is visible from
   across the room. It is shown on the bar rather than on the card, because the bar
   is where the question is — and where there is no question the bar itself says no.

   Held as a moment rather than applied once, for the same reason the speaking card
   is: the board rewrites itself on the minute boundary, and a refusal is shorter
   than a minute but may straddle one. */
/* Where, when, and which way round a card last moved, so the flare over the slot
   survives the minute boundary the same way the refusal does. */
const flareLasts = 1500;
let takenAt = 0, takenDay = 1, takenBack = false;
function flare(day: string, back: boolean) {
  takenAt = Date.now();
  takenDay = ((new Date(`${day}T00:00`).getDay() + 6) % 7) + 1;
  takenBack = back;
  /* Once to light it, once to put it out. */
  setTimeout(() => void draw(new Date()), flareLasts);
}

const refusalLasts = 1400;
let refusedAt = 0, refusedSaid = 0, refusedCard = "";

/* What a card is called out loud: what it was given to say when it is offered, and
   its name where it was given nothing. */
const spokenAs = (card: Card) => card.speech?.trim() || card.name;
/* Two are joined with oder, more with commas and one oder at the end — the way one
   would say them, not the way a list is printed. */
const listed = (names: string[]) => names.length < 2 ? names.join("")
  : `${names.slice(0, -1).join(", ")} oder ${names[names.length - 1]}`;

function refuse(open: Appointment | undefined, cards: Map<string, Card>, uid: string, card?: Card) {
  /* A tag nobody has written down anywhere is a setup state rather than a mistake
     by the child, and the number is the one thing whoever is setting it up needs.
     It goes in the quiet line — before anything else here, because registering a
     card is exactly the moment when no question is open and the rest of this
     function has nothing to do. */
  if (!card) trouble(`Unbekannte Karte: ${uid}`);
  refusedAt = Date.now();
  app.querySelector(".slotbar")?.classList.add("wrong");
  setTimeout(() => {
    if (Date.now() - refusedAt >= refusalLasts) app.querySelector(".slotbar")?.classList.remove("wrong");
  }, refusalLasts);

  /* And it is said, because a card held against the reader is a question asked out
     loud and deserves an answer in kind: what this one is not, and what would do
     instead. Only where a question is actually open — with nothing to choose there
     is nothing to offer, and a sentence listing nothing is worse than silence.

     The same door the calendar speaks a single line through; it stops whatever was
     being said, which is right here, since the child is standing at the slot. */
  const offered = open?.options.map(id => cards.get(id)).filter(Boolean) as Card[] | undefined;
  if (!offered?.length) return;
  /* A card held there for a moment reads several times. It is one question, so it
     gets one answer. */
  const again = uid === refusedCard && Date.now() - refusedSaid < 6000;
  refusedCard = uid;
  if (again) return;
  refusedSaid = Date.now();
  const what = card ? spokenAs(card) : "Diese Karte";
  const sentence = `${what} steht gerade nicht zur Auswahl. Du kannst ${listed(offered.map(spokenAs))} wählen.`;
  void preview(sentence).then(why => { if (why) trouble(why); });
}

async function draw(at: Date) {
  app.innerHTML = await build(at);
  light(lit);
  if (Date.now() - refusedAt < refusalLasts) app.querySelector(".slotbar")?.classList.add("wrong");
}

async function tick() {
  const at = new Date();
  await draw(at);
  setTimeout(tick, 60_000 - (at.getSeconds() * 1000 + at.getMilliseconds()) + 20);
}

/* The card in the slot is the answer, for as long as it lies there — taking it out
   takes the answer back. That holds until the appointment begins; from then on it
   is not a plan any more but what is happening, and the board keeps it. Otherwise
   an afternoon that was ridden through would turn back into a question the moment
   the card was tidied away, and next week's board would show a question mark over
   a day that no longer had one. */
const ahead = (appointment: Appointment, at: Date, now: string) =>
  appointment.date > iso(at) || (appointment.date === iso(at) && !allDay(appointment) && appointment.start! > now);

/* A tag's number is written down in whatever shape the thing that read it produced,
   and every one of those shapes is the same number: the calendar upper-cases what
   somebody types, this reader hands out lower case, and people paste them with
   colons, spaces or dashes in between. So neither side's spelling is compared —
   only the hex digits, which is the part that is actually the tag.

   A card may carry several of them, separated by commas. One picture is often more
   than one object in a household — the same choice laminated twice, or a card that
   lost its sticker and got a new one — and those are one card with two tags rather
   than two cards that would both have to be offered. */
const bare = (uid: string) => uid.toLowerCase().replace(/[^0-9a-f]/g, "");
const tagsOf = (written: string) => written.split(",").map(bare).filter(Boolean);
const sameTag = (written: string | undefined, read: string) => !!written && tagsOf(written).includes(bare(read));

/* Which card lies on the reader. Presence is a fact about the room rather than a
   record: it lives as long as this page does, and the only thing written from it
   is the option a choice was answered with. */
let inSlot: string | undefined;
async function reads(uid: string | null): Promise<void> {
  const at = new Date(), now = reading(at);
  const appointments = await week(mondayOf(at));
  if (uid) {
    const cardList = await allCards();
    const card = cardList.find(item => sameTag(item.nfc, uid));
    const open = pending(appointments, iso(at), iso(addDays(at, 1)), now);
    /* Only a card the question offers answers it. Anything else is refused, and
       one that is already the answer is not written a second time. */
    if (!card || !open || !open.options.includes(card.id)) {
      return refuse(open, new Map(cardList.map(item => [item.id, item])), uid, card);
    }
    inSlot = card.id;
    if (open.chosen === card.id) return;
    await put({ ...open, chosen: card.id });
    flare(open.date, false);
  } else {
    /* No reader is not no card. A reader that was unplugged would otherwise
       withdraw every answer at once, which is the one failure that would reach the
       child — belt and braces, since a bridge that is gone sends nothing at all. */
    if (readerGone) return;
    const card = inSlot;
    inSlot = undefined;
    /* Nothing was lying there as far as this page knows — which is the state a fresh
       connection reports before anything has happened on it. Without this, `chosen`
       of `undefined` matches every appointment nobody has answered, and the first
       one of those gets "withdrawn": a write that changes nothing, and a light over
       the slot saying something was taken back that was never given. */
    if (!card) return;
    const decided = appointments.find(item => item.chosen === card && ahead(item, at, now));
    if (!decided) return;
    const { chosen: _withdrawn, ...rest } = decided;
    await put(rest);
    /* Taking it back gets the same light in the same place, running the other way:
       the question is standing there again, and it happened at the slot. */
    flare(decided.date, true);
  }
  await draw(at);
}

/* The reader's door, and it carries two facts rather than one, because they fail
   apart: which card is lying there, and whether there is a reader at all. A tag
   that is gone and a reader that is gone look identical from here and mean opposite
   things — one is an answer taken back, the other is a machine to fix while every
   answer stays exactly as it was.

   `karte` is the UID, or `null` for no card. `leser` is whether the reader is
   answering. Debouncing belongs on the other side of this door, where the polling
   is: a single missed read must never arrive here as a removal. */
addEventListener("karte", event => { void reads((event as CustomEvent<string | null>).detail ?? null); });
let readerGone = false;
addEventListener("leser", event => {
  readerGone = !(event as CustomEvent<boolean>).detail;
  void draw(new Date());
});

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
/* Where a folder is the store, it is read before anything is drawn, and watched
   afterwards: another household member editing on another machine is the reason
   a folder was chosen at all. */
await ablage.restore().catch(() => null);
await pullFromFolder().catch(() => undefined);
/* The board resolves references rather than searching, but a reference whose
   qualified path no longer matches is looked up by name — and that lookup answers
   in index order unless it is told which fassung was meant. See `urlFor`. */
preferRendering((await settings()).metacomRendering ?? null);
void tick();
/* Und der Leser, falls auf dieser Maschine eine Brücke läuft. */
listen();
/* Somebody else's edit, arriving as a file that changed under this browser. */
if (await adopted()) watchFolder(() => void pullFromFolder().then(tick));
