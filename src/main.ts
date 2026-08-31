import "./style.css";

/* The board has no planning logic. It receives resolved calendar events. */
const root = "/metacom-local/";

/* Household configuration: the visible window of a day and the planning grid. */
const board = { from: "07:00", to: "20:30", snap: 15 };

const symbols = {
  breakfast: "Lebensmittel_Essen/fruehstueck2.png", clothes: "Verben/anziehen1.png", bike: "Fahrzeuge/fahrrad.png",
  kita: "Berufe/kindergaertnerin.png", play: "Spielen/spielplatz.png", shop: "Einkaufen/einkaufen.png",
  cook: "Lebensmittel_Essen/abendessen.png", sleep: "Verben/schlafen1.png", pajamas: "Kleidung_Accessoires/schlafanzug.png",
  teeth: "Koerperpflege/zaehneputzen.png", speech: "Therapie/sprachtherapielogopaedie.png", early: "Therapie/fruehfoerderung.png",
  lunch: "Lebensmittel_Essen/mittagessen.png", bricks: "Spielen/bausteinespielen.png",
  book: "Buch_Zeitung/bilderbuch.png", ball: "Spielen/ballspielen.png",
} as const;
type SymbolName = keyof typeof symbols;

/* People carry an avatar that is either a photo or their initials. */
type Person = { initials: string; tone: string; photo?: string };
const people: Record<string, Person> = {
  bente: { initials: "BE", tone: "#b8460f" },
  mika: { initials: "MI", tone: "#1d5fb0" },
  mama: { initials: "MA", tone: "#7b3fa0" },
  papa: { initials: "PA", tone: "#0f6b62" },
  oma: { initials: "OM", tone: "#a3630c" },
  opa: { initials: "OP", tone: "#2d5c2a" },
};
type PersonName = keyof typeof people;

/* There is one kind of timed appointment. Its symbol is either fixed, or not decided
   yet — then `options` holds what the parents allow and the NFC slot picks one. A
   resolved choice is an ordinary appointment; nothing else about it differs. */
type Event = { start: string; end: string; icons?: SymbolName[]; options?: SymbolName[]; people?: PersonName[]; showPeople?: boolean; past?: boolean; current?: boolean };
/* Visit and birthday are not timed appointments; they belong to whole days and are
   shown as the person they concern, at the top of every day they cover. One person
   per entry — two guests are two visits. */
type Special = { kind: "visit" | "birthday"; person: PersonName; days: string[] };
type Day = { name: string; date: string; today?: boolean; events: Event[] };

const everyWeekday = (): Event[] => [
  { start: "07:15", end: "07:45", icons: ["breakfast"] }, { start: "07:45", end: "08:25", icons: ["clothes"] },
  { start: "08:30", end: "08:45", icons: ["bike"] }, { start: "08:45", end: "14:00", icons: ["kita"] },
  { start: "14:00", end: "18:00", icons: ["play"] }, { start: "18:00", end: "18:30", icons: ["cook"] },
  { start: "18:30", end: "19:15", icons: ["lunch"] }, { start: "19:30", end: "20:15", icons: ["pajamas", "teeth", "sleep"] },
];
const therapy = (icon: SymbolName, start: string, end: string): Event => ({ start, end, icons: [icon], people: ["bente"], showPeople: true });
/* On the current day the board separates done, running and still ahead. */
const relativeToNow = (events: Event[]) => events.map(event => ({ ...event, past: event.end <= now, current: event.start <= now && now < event.end }));
/* Mock household routine, indexed Monday to Sunday. Real data arrives resolved per
   date; only the shape of the array below is standing in for it. */
const names = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];
const routine: Event[][] = [
  everyWeekday(),
  [...everyWeekday(), therapy("speech", "11:00", "11:45")],
  everyWeekday(),
  [...everyWeekday(), therapy("speech", "11:00", "11:45"), therapy("early", "12:00", "13:15")],
  everyWeekday(),
  [
    { start: "08:00", end: "08:40", icons: ["breakfast"] }, { start: "08:40", end: "09:20", icons: ["clothes"] }, { start: "10:00", end: "11:30", icons: ["shop"], people: ["mama", "bente"], showPeople: true }, { start: "12:00", end: "13:00", icons: ["lunch"] }, { start: "14:00", end: "18:00", options: ["play", "bike"] }, { start: "18:30", end: "19:15", icons: ["lunch"] }, { start: "19:30", end: "20:15", icons: ["pajamas", "teeth", "sleep"] },
  ],
  [
    { start: "08:00", end: "08:40", icons: ["breakfast"] }, { start: "08:40", end: "09:20", icons: ["clothes"] }, { start: "10:00", end: "12:00", options: ["bricks", "book"] }, { start: "12:00", end: "13:00", icons: ["lunch"] }, { start: "14:00", end: "18:00", options: ["play", "ball"] }, { start: "18:30", end: "19:15", icons: ["lunch"] }, { start: "19:30", end: "20:15", icons: ["pajamas", "teeth", "sleep"] },
  ],
];

/* Mock: keyed on weekday. Real visits and birthdays carry dates. */
const specials: Special[] = [
  { kind: "birthday", person: "mika", days: ["SO"] },
  { kind: "visit", person: "oma", days: ["SA", "SO"] },
  { kind: "visit", person: "opa", days: ["SA", "SO"] },
];

const minute = (time: string) => { const [hour, rest] = time.split(":").map(Number); return hour * 60 + rest; };
const snapped = (time: string) => Math.round(minute(time) / board.snap) * board.snap;
const reading = (at: Date) => `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;

/* Everything below is recomputed on every render, because all of it depends on what
   time it is: the clock, which column is today, and the scale of the day. */
let now = "00:00", todayIndex = 0, first = 0, span = 1;
/* The configured window is a floor, not a frame: a week that starts earlier or ends
   later stretches it to the full hour, so an appointment can never fall outside the
   column. It is never made smaller, so the scale stays stable in a normal week. */
function scale(week: Day[]) {
  const times = week.flatMap(day => day.events).flatMap(event => [snapped(event.start), snapped(event.end)]);
  const opens = snapped(board.from), closes = snapped(board.to);
  const earliest = Math.min(opens, ...times), latest = Math.max(closes, ...times);
  first = earliest < opens ? Math.floor(earliest / 60) * 60 : opens;
  span = (latest > closes ? Math.ceil(latest / 60) * 60 : closes) - first;
}
/* The time scale is exact: an appointment is as tall as it is long, down to one
   grid step. The gap between cards is subtracted in pixels, not in minutes. */
const pos = (time: string) => ((snapped(time) - first) / span) * 100;
/* The rail reads the clock unsnapped, so its edge moves every minute rather than
   every grid step, and is clamped for times outside the day window. */
const reached = (time: string) => Math.max(0, Math.min(100, ((minute(time) - first) / span) * 100));

/* Overlapping appointments share the width of the day for as long as they run in
   parallel. Everything that overlaps directly or through a neighbour forms one
   cluster and is laid out over the same number of lanes. */
type Placed = { event: Event; top: number; height: number; lane: number; lanes: number };
function place(events: Event[]): Placed[] {
  const placed: Placed[] = [...events]
    .sort((a, b) => snapped(a.start) - snapped(b.start) || snapped(b.end) - snapped(a.end))
    .map(event => ({ event, top: pos(event.start), height: pos(event.end) - pos(event.start), lane: 0, lanes: 1 }));
  let cluster: Placed[] = [];
  let clusterEnd = -Infinity;
  let ends: number[] = [];
  const close = () => {
    const lanes = cluster.reduce((most, item) => Math.max(most, item.lane + 1), 1);
    cluster.forEach(item => { item.lanes = lanes; });
    cluster = [];
    ends = [];
    clusterEnd = -Infinity;
  };
  placed.forEach(item => {
    const start = snapped(item.event.start), end = snapped(item.event.end);
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

const picture = (name: SymbolName) => `<img src="${root}${symbols[name]}" alt="" />`;
const crown = `<svg class="crown" viewBox="0 0 24 15" aria-hidden="true"><path d="M1.5 13.5 3 2.5l5 4.5 4-6 4 6 5-4.5 1.5 11Z"/></svg>`;
const avatar = (name: PersonName, extra = "") => {
  const person = people[name];
  const face = person.photo ? `<img src="${person.photo}" alt="" />` : `<b>${person.initials}</b>`;
  return `<span class="face" style="--tone:${person.tone}" title="${name}">${face}${extra}</span>`;
};
const faces = (names: PersonName[], extra = "") => {
  /* Three avatars is what a narrow column can carry; the rest becomes a count. */
  const shown = names.slice(0, 3), rest = names.length - shown.length;
  const more = rest > 0 ? `<span class="face" style="--tone:#57504a"><b>+${rest}</b></span>` : "";
  return `<span class="faces">${shown.map(name => avatar(name, extra)).join("")}${more}</span>`;
};

function card({ event, top, height, lane, lanes }: Placed) {
  /* An undecided appointment shows what may be chosen, not a question mark: the
     child sees the same symbols that are on the physical cards. */
  const shown = event.icons ?? event.options ?? [];
  const classes = ["card", event.past ? "past" : "", event.current ? "current" : "", event.options && !event.icons ? "open" : "", lanes > 1 ? "parallel" : ""].filter(Boolean).join(" ");
  /* Parallel appointments are allowed to overlap a little rather than being cut
     into exact shares — two side by side stay wide enough to carry their symbol. */
  const width = lanes > 1 ? 100 / lanes + 22 / lanes : 100;
  const left = lanes > 1 ? (lane * (100 - width)) / (lanes - 1) : 0;
  const box = `top:${top}%;height:calc(${height}% - 5px);left:calc(${left}% + 3px);width:calc(${width}% - 6px);z-index:${1 + lane}`;
  const crowd = event.showPeople && event.people ? faces(event.people) : "";
  return `<div class="${classes}" style="${box}"><span class="icons">${shown.map(name => `<span class="icon">${picture(name)}</span>`).join("")}</span>${crowd}</div>`;
}
function column(day: Day, index: number) {
  const marks = specials.filter(special => special.days.includes(day.name))
    .map(special => avatar(special.person, special.kind === "birthday" ? crown : "")).join("");
  const clock = day.today ? `<small>${now}</small>` : "";
  const state = day.today ? "today" : index < todayIndex ? "gone" : "ahead";
  return `<section class="day day-${index + 1} ${state}">
    <header><span class="name"><b>${day.name}</b><time>${day.date}</time>${clock}</span><span class="marks">${marks ? `<span class="faces">${marks}</span>` : ""}</span></header>
    <div class="calendar"><div class="track">${place(day.events).map(card).join("")}</div></div>
  </section>`;
}

/* The daypart rail is drawn, not photographed. The three sun marks follow the same
   dotted arc as the METACOM mittags/nachmittags symbols and differ only in where
   the sun stands on it, so the four marks read as one flat white icon family and
   never compete with the appointment symbols. */
const sun = (cx: number, cy: number) => {
  const radius = 2.8;
  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map(degree => {
    const angle = (degree * Math.PI) / 180, [dx, dy] = [Math.cos(angle), Math.sin(angle)];
    return `M${(cx + dx * 4.1).toFixed(1)} ${(cy + dy * 4.1).toFixed(1)}L${(cx + dx * 5.5).toFixed(1)} ${(cy + dy * 5.5).toFixed(1)}`;
  }).join("");
  return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="currentColor" stroke="none"/><path d="${rays}" stroke-width="1.7"/>`;
};
const arc = `<path d="M4 20a8 8 0 0 1 16 0" stroke-dasharray="1.3 2.7" stroke-width="1.7" opacity=".8"/>`;
const glyph = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const dayparts = [
  { at: "08:00", icon: glyph(arc + sun(5.8, 16.6)) },
  { at: "12:00", icon: glyph(arc + sun(12, 11.6)) },
  { at: "15:30", icon: glyph(arc + sun(18.2, 16.6)) },
  { at: "19:15", icon: glyph(`<path d="M20 15.4A8.4 8.4 0 0 1 8.6 4a7.4 7.4 0 1 0 11.4 11.4Z" fill="currentColor" stroke="none"/>`) },
];

/* The board is a projection of one moment, so building it is one function of `at`.
   Nothing is cached between renders except the drawn glyphs above. */
function build(at: Date) {
  now = reading(at);
  todayIndex = (at.getDay() + 6) % 7;
  const monday = new Date(at);
  monday.setDate(at.getDate() - todayIndex);
  const week: Day[] = routine.map((events, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return { name: names[index], date: `${date.getDate()}.${date.getMonth() + 1}.`, today: index === todayIndex, events: index === todayIndex ? relativeToNow(events) : events };
  });
  scale(week);
  const active = dayparts.filter(part => snapped(part.at) <= snapped(now)).length - 1;
  const rail = `<aside class="rail day-${todayIndex + 1}" aria-hidden="true" style="--now:${reached(now)}%"><div class="rail-head"></div><div class="rail-track">
    ${dayparts.map((part, index) => `<span class="mark${index === active ? " is-now" : ""}" style="top:${pos(part.at)}%">${part.icon}</span>`).join("")}
  </div></aside>`;
  const track: string[] = week.map(day => (day.today ? "var(--today)" : "var(--col)"));
  const cells: string[] = week.map(column);
  track.splice(todayIndex, 0, "var(--rail)");
  cells.splice(todayIndex, 0, rail);
  return `<div class="week" style="grid-template-columns:${track.join(" ")}">${cells.join("")}</div>`;
}

/* Redraw on every minute boundary rather than on an interval, so the board never
   drifts away from the wall clock and a resumed kiosk catches up immediately. */
const app = document.querySelector<HTMLElement>("#app")!;
function tick() {
  const at = new Date();
  app.innerHTML = build(at);
  setTimeout(tick, 60_000 - (at.getSeconds() * 1000 + at.getMilliseconds()) + 20);
}
tick();
