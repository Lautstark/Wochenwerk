import { el, fill } from "../ui.js";
import { allDay, board, bornOn, clock, iso, lanesOf, minute, shownCards, snapped, titleOf, undecided,
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
  const head = el("div", { class: "cal__head" });
  const whole = el("div", { class: "cal__whole" });
  const body = el("div", { class: "cal__body" });
  const node = el("div", { class: "cal" }, head, whole, body);
  let span = { from: snapped(board.from), to: snapped(board.to) };

  const kindOf = (appointment: Appointment) =>
    [appointment.series ? "" : "once", undecided(appointment) ? "choice" : ""].filter(Boolean).join(" ");

  function draw(current: Week) {
    const today = iso(new Date());
    const now = new Date(), at = now.getHours() * 60 + now.getMinutes();
    const times = current.appointments.filter(item => !allDay(item)).flatMap(item => [snapped(item.start!), snapped(item.end!)]);
    span = {
      from: Math.floor(Math.min(snapped(board.from), ...times) / 60) * 60,
      to: Math.ceil(Math.max(snapped(board.to), ...times) / 60) * 60,
    };
    const hours = Array.from({ length: (span.to - span.from) / 60 }, (_, index) => span.from + index * 60);

    fill(head, el("div", { class: "cal__corner" }), ...current.dates.map((date, index) =>
      el("div", { class: `cal__day${date === today ? " cal__day--today" : ""}` },
        el("b", { text: weekdays[index] }), el("span", { text: String(Number(date.slice(8))) }))));

    fill(whole, el("div", { class: "cal__corner", text: "ganztägig" }), ...current.dates.map(date =>
      el("div", { class: "cal__whole-cell", on: { click: event => { if (event.target === event.currentTarget) onCreate(date); } } },
        ...current.appointments.filter(item => item.date === date && allDay(item)).map(item =>
          el("button", { class: `whole ${kindOf(item)}`.trim(), attrs: { type: "button" }, on: { click: () => onOpen(item) } },
            ...shownCards(item).map(id => cardThumb(cardById(id))),
            ...item.symbols.map(symbol => picture(symbol, symbol.label)),
            el("span", { class: "whole__name", text: titleOf(item, current.cards) || "Ganztägig" }),
            ...item.people.map(id => {
              const person = personById(id);
              return el("span", { class: "whole__who" },
                person && bornOn(person, date) ? el("span", { class: "crown", text: "👑" }) : null, face(person, "sm"));
            }))))));

    fill(body,
      el("div", { class: "cal__gutter" }, ...hours.map(hour =>
        el("div", { class: "cal__hour", style: { height: `${HOUR}px` } }, el("span", { text: clock(hour) })))),
      ...current.dates.map(date => {
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
          const name = titleOf(appointment, current.cards) || (undecided(appointment) ? "Auswahl" : "Termin");
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

  return { node, draw };
}
export const minutesOf = minute;
export const shownWeek = shown;
