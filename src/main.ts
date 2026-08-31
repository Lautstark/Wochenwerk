import "./style.css";

/* The board has no planning logic. It receives resolved calendar events. */
const root = "/metacom-local/";
const symbols = {
  morning: "Zeit/morgens2.png", noon: "Zeit/mittags2.png", afternoon: "Zeit/nachmittags.png", evening: "Zeit/abends.png",
  breakfast: "Lebensmittel_Essen/fruehstueck2.png", clothes: "Verben/anziehen1.png", bike: "Fahrzeuge/fahrrad.png",
  kita: "Berufe/kindergaertnerin.png", play: "Spielen/spielplatz.png", shop: "Einkaufen/einkaufen.png",
  cook: "Lebensmittel_Essen/abendessen.png", sleep: "Verben/schlafen1.png", pajamas: "Kleidung_Accessoires/schlafanzug.png", teeth: "Koerperpflege/zaehneputzen.png", speech: "Therapie/sprachtherapielogopaedie.png",
  early: "Therapie/fruehfoerderung.png", bente: "Pronomen/ihr_maedchen.png", lunch: "Lebensmittel_Essen/mittagessen.png",
  choice: "Fragen/wasspielen.png", visit: "Personen/besuch.png", birthday: "Feste/geburtstag.png",
} as const;
type SymbolName = keyof typeof symbols;
type Event = { start: string; end: string; icons: SymbolName[]; person?: SymbolName; showAvatar?: boolean; track?: "left" | "right"; past?: boolean; choice?: boolean };
type Day = { name: string; date: string; today?: boolean; allDay?: SymbolName[]; events: Event[] };

const everyWeekday = (split = false): Event[] => [
  { start: "07:15", end: "07:45", icons: ["breakfast"] }, { start: "07:45", end: "08:25", icons: ["clothes"] },
  { start: "08:30", end: "08:45", icons: ["bike"] }, { start: "08:45", end: "14:00", icons: ["kita"], track: split ? "left" : undefined },
  { start: "14:00", end: "18:00", icons: ["play"] }, { start: "18:00", end: "18:30", icons: ["cook"] },
  { start: "18:30", end: "19:15", icons: ["lunch"] }, { start: "19:30", end: "20:15", icons: ["pajamas", "teeth", "sleep"] },
];
const muted = (events: Event[]) => events.map(event => ({ ...event, past: event.end <= "15:40" }));
const week: Day[] = [
  { name: "MO", date: "26.5.", events: everyWeekday() },
  { name: "DI", date: "27.5.", events: [...everyWeekday(true), { start: "11:00", end: "11:45", icons: ["speech"], person: "bente", showAvatar: true, track: "right" }] },
  { name: "MI", date: "28.5.", today: true, events: muted(everyWeekday()) },
  { name: "DO", date: "29.5.", events: [...everyWeekday(true), { start: "11:00", end: "11:45", icons: ["speech"], person: "bente", showAvatar: true, track: "right" }, { start: "12:00", end: "13:15", icons: ["early"], person: "bente", showAvatar: true, track: "right" }] },
  { name: "FR", date: "30.5.", events: everyWeekday() },
  { name: "SA", date: "31.5.", events: [
    { start: "08:00", end: "08:40", icons: ["breakfast"] }, { start: "08:40", end: "09:20", icons: ["clothes"] }, { start: "10:00", end: "11:30", icons: ["shop"] }, { start: "12:00", end: "13:00", icons: ["lunch"] }, { start: "14:00", end: "18:00", icons: ["choice"], choice: true }, { start: "18:30", end: "19:15", icons: ["lunch"] }, { start: "19:30", end: "20:15", icons: ["pajamas", "teeth", "sleep"] },
  ] },
  { name: "SO", date: "1.6.", allDay: ["visit", "birthday"], events: [
    { start: "08:00", end: "08:40", icons: ["breakfast"] }, { start: "08:40", end: "09:20", icons: ["clothes"] }, { start: "10:00", end: "12:00", icons: ["choice"], choice: true }, { start: "12:00", end: "13:00", icons: ["lunch"] }, { start: "14:00", end: "18:00", icons: ["choice"], choice: true }, { start: "18:30", end: "19:15", icons: ["lunch"] }, { start: "19:30", end: "20:15", icons: ["pajamas", "teeth", "sleep"] },
  ] },
];
const minute = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
const first = minute("07:00"), duration = minute("20:30") - first;
const image = (name: SymbolName) => `<img src="${root}${symbols[name]}" alt="" />`;
function eventCard(event: Event) {
  const top = ((minute(event.start) - first) / duration) * 100, height = Math.max(3.2, ((minute(event.end) - minute(event.start)) / duration) * 100);
  const classes = ["event", event.track ? `track-${event.track}` : "", event.past ? "past" : "", event.choice ? "choice" : ""].filter(Boolean).join(" ");
  const avatar = event.showAvatar && event.person ? `<span class="avatar">${image(event.person)}</span>` : "";
  return `<div class="${classes}" style="top:${top}%;height:${height}%"><div class="event-icons">${event.icons.map(image).join("")}</div>${avatar}</div>`;
}
function column(day: Day, index: number) {
  const allDay = day.allDay ? `<div class="all-day">${day.allDay.map(image).join("")}</div>` : "";
  const nowTop = ((minute("15:40") - first) / duration) * 100;
  const now = day.today ? `<div class="now-glow" style="top:${nowTop}%"></div>` : "";
  const content = day.today ? `<div class="today-body">${rail}<div class="calendar">${now}${day.events.map(eventCard).join("")}</div></div>` : `<div class="calendar">${day.events.map(eventCard).join("")}</div>`;
  return `<section class="day day-${index + 1} ${day.today ? "today" : ""}"><header><b>${day.name}</b><time>${day.date}</time>${day.today ? "<small>15:40</small>" : ""}${allDay}</header>${content}</section>`;
}
const nowTop = ((minute("15:40") - first) / duration) * 100;
const rail = `<aside class="focus-rail" aria-hidden="true"><span style="--at:11%">${image("morning")}</span><span style="--at:35%">${image("noon")}</span><span class="is-now" style="--at:${nowTop}%">${image("afternoon")}</span><span style="--at:89%">${image("evening")}</span></aside>`;
const columns = week.map(column).join("");
document.querySelector<HTMLElement>("#app")!.innerHTML = `<section class="board" aria-label="Wochenplan"><div class="week">${columns}</div></section>`;
