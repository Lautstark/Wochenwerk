import { el, fill } from "../ui.js";
import { allDay, board, bornOn, clock, drawnSymbols, iso, lanesOf, minute, runsOf, snapped, titleOf, undecided,
  weekdays, type Appointment } from "../model.js";
import { cardById, personById, shown, type Week } from "../store.js";
import { cardThumb, face, picture } from "./pieces.js";

const HOUR = 46;

/* The week as a calendar: hours down the side, a column per day, what lasts all
   day in a row of its own. What differs between entries is not which activity
   they hold — the name says that — but what kind of entry they are, and there are
   three of those which combine. Three marks, because a colour cannot say two
   things at once. */
export function weekGrid(onOpen: (appointment: Appointment) => void, onCreate: (date: string, start?: string) => void) {
  /* Which of the week's days are drawn. Seven of them side by side needs width
     nobody has on a phone, so a narrow screen shows the one day being looked at
     and the same grid draws it. */
  let visible: string[] | null = null;
  const head = el("div", { class: "cal__head" });
  const whole = el("div", { class: "cal__whole" });
  const body = el("div", { class: "cal__body" });
  const node = el("div", { class: "cal" }, head, whole, body);
  let span = { from: snapped(board.from), to: snapped(board.to) };

  const kindOf = (appointment: Appointment) =>
    [appointment.series ? "" : "once", undecided(appointment) ? "choice" : ""].filter(Boolean).join(" ");

  function draw(current: Week) {
    const days = visible ?? current.dates;
    node.style.setProperty("--days", String(days.length));
    const today = iso(new Date());
    const now = new Date(), at = now.getHours() * 60 + now.getMinutes();
    const times = current.appointments.filter(item => !allDay(item)).flatMap(item => [snapped(item.start!), snapped(item.end!)]);
    span = {
      from: Math.floor(Math.min(snapped(board.from), ...times) / 60) * 60,
      to: Math.ceil(Math.max(snapped(board.to), ...times) / 60) * 60,
    };
    const hours = Array.from({ length: (span.to - span.from) / 60 }, (_, index) => span.from + index * 60);

    fill(head, el("div", { class: "cal__corner" }), ...days.map(date =>
      el("div", { class: `cal__day${date === today ? " cal__day--today" : ""}` },
        el("b", { text: weekdays[current.dates.indexOf(date)] }), el("span", { text: String(Number(date.slice(8))) }))));

    /* Ganztägiges is a band of stretches, not a cell per day: three days of one
       visit are one bar, written once. The rules underneath stay a cell each,
       because clicking an empty day is still how a day gets an appointment. */
    const runs = runsOf(current.appointments, days, current.series);
    const lanes = runs.length ? Math.max(...runs.map(run => run.lane)) + 1 : 1;
    whole.style.setProperty("--lanes", String(lanes));
    fill(whole,
      el("div", { class: "cal__corner", text: "ganztags" }),
      ...days.map((date, index) => el("div", { class: "cal__whole-rule",
        attrs: { style: `grid-column: ${index + 2}` },
        on: { click: event => { if (event.target === event.currentTarget) onCreate(date); } } })),
      ...runs.map(run => {
        const item = run.appointment;
        const first = drawnSymbols(item, current.cards)[0];
        return el("button", {
          /* A stretch cut by the edge of the week is left flat there. Nothing says
             so in words: a bar that is rounded at one end and squared at the other
             is already the sentence. */
          class: `whole ${kindOf(item)}${run.before ? " whole--from" : ""}${run.after ? " whole--into" : ""}`.replace(/\s+/g, " ").trim(),
          attrs: { type: "button",
            style: `grid-column: ${days.indexOf(run.days[0]) + 2} / span ${run.days.length}; grid-row: ${run.lane + 1}` },
          on: { click: () => onOpen(item) },
        },
          first ? picture(first, first.label) : null,
          el("span", { class: "whole__name", text: titleOf(item, current.cards, current.people) || "Ganztägig" }),
          item.people.length ? el("span", { class: "whole__who" },
            ...item.people.slice(0, 3).map(id => {
              const person = personById(id);
              return el("span", { class: "whole__face" },
                face(person, "sm"),
                person && bornOn(person, run.days[0]) ? el("span", { class: "crown", text: "👑" }) : null);
            })) : null);
      }));

    fill(body,
      el("div", { class: "cal__gutter" }, ...hours.map(hour =>
        el("div", { class: "cal__hour", style: { height: `${HOUR}px` } }, el("span", { text: clock(hour) })))),
      ...days.map(date => {
        const column = el("div", {
          class: `cal__col${date === today ? " cal__col--today" : ""}`,
          style: { height: `${((span.to - span.from) / 60) * HOUR}px` },
          on: { click: event => {
            if (event.target !== event.currentTarget) return;
            const minutes = Math.round((span.from + ((event as MouseEvent).offsetY / HOUR) * 60) / board.snap) * board.snap;
            onCreate(date, clock(Math.min(minutes, span.to - board.snap)));
          } },
        }, ...hours.map((_, index) => el("div", { class: "cal__rule", style: { top: `${index * HOUR}px` } })));

        if (date === today && at >= span.from && at <= span.to) {
          column.appendChild(el("div", { class: "cal__now", style: { top: `${((at - span.from) / 60) * HOUR}px` } }));
        }
        for (const { appointment, lane, lanes } of lanesOf(current.appointments.filter(item => item.date === date && !allDay(item)))) {
          const top = ((snapped(appointment.start!) - span.from) / 60) * HOUR;
          /* Short appointments keep a floor so their name still fits; two may
             overlap by a few pixels rather than both being unreadable. */
          const tall = Math.max(26, ((snapped(appointment.end!) - snapped(appointment.start!)) / 60) * HOUR);
          const name = titleOf(appointment, current.cards, current.people) || (undecided(appointment) ? "Auswahl" : "Termin");
          const width = 100 / lanes;
          column.appendChild(el("button", {
            class: `event ${kindOf(appointment)}${tall < 40 ? " event--tight" : ""}`.trim(),
            attrs: { type: "button", title: `${name} · ${appointment.start}–${appointment.end}` },
            style: { top: `${top}px`, height: `${tall - 2}px`, left: `calc(${lane * width}% + 2px)`, width: `calc(${width}% - 4px)` },
            on: { click: () => onOpen(appointment) },
          }, el("span", { class: "event__name", text: name }),
             el("span", { class: "event__who" }, ...appointment.people.map(id => face(personById(id), "sm")))));
        }
        return column;
      }));
  }

  return { node, draw, show: (dates: string[] | null) => { visible = dates; } };
}
export const minutesOf = minute;
export const shownWeek = shown;
