import { openDialog, confirmDialog } from "@lautstark/design/dialog";
import { button, el, field, fill, input, spacer } from "../ui.js";
import { addDays, allDay, board, clock, dayLabel, derivedName, iso, minute, titleOf,
  weekdays, type Appointment, type Pattern } from "../model.js";
import { createSeries, dropSeries, editSeries, put, reachOf, remove, uuid } from "../db.js";
import { cardById, load, shown } from "../store.js";
import { cardThumb, grid, picture, pickerItem, face } from "./pieces.js";
import { symbolSearch } from "./symbol-search.js";
import { editCard } from "./card-dialog.js";
import { askScope } from "./scope-dialog.js";

type Repeat = "none" | "daily" | "weekly" | "yearly";

export const blankAppointment = (date: string, start?: string): Appointment => ({
  id: uuid(), date, start, end: start ? clock(minute(start) + 30) : undefined,
  symbols: [], options: [], people: [], showPeople: false, updatedAt: 0,
});

export function editAppointment(appointment: Appointment, existing: boolean, done: () => void) {
  const draft: Appointment = structuredClone(appointment);
  let mode: "symbols" | "choice" = draft.options.length ? "choice" : "symbols";
  let repeat: Repeat = "none";
  let weekly = [(new Date(`${draft.date}T00:00`).getDay() + 6) % 7];
  let counts = { from: 0, all: 0 };

  /* Every control is made once. Only what a change actually affects is refilled,
     which is what keeps a caret where somebody put it. */
  const title = el("input", { class: "title-input", attrs: { type: "text", autocomplete: "off" } });
  const date = input("date"), from = input("time", { attrs: { step: board.snap * 60 } });
  const to = input("time", { attrs: { step: board.snap * 60 } }), spanTo = input("date");
  const whole = input("checkbox");
  title.value = draft.title ?? "";
  date.value = draft.date; from.value = draft.start ?? "09:00"; to.value = draft.end ?? "09:30";
  spanTo.value = draft.date; whole.checked = allDay(draft);

  /* One row, and the fields in it appear or not. A second row holding a second
     copy of the day was how the first one lost its input to the other. */
  const dayField = field("Tag", date), fromField = field("Von", from), toField = field("Bis", to);
  const spanField = field("Bis", spanTo);
  const timeRow = el("div", { class: "row-of" }, dayField, fromField, toField, spanField);
  const wholeRow = el("label", { class: "choice" }, whole, el("span", { text: "Ganztägig" }));
  const seriesLine = el("p", { class: "small muted" });

  const kinds = el("div", { class: "segmented" },
    button("Symbole", "sm", () => { mode = "symbols"; sync(); }),
    button("Das Kind wählt", "sm", () => { mode = "choice"; sync(); }));
  const chosen = el("div", { class: "chosen" });
  const search = symbolSearch(ref => {
    if (!draft.symbols.some(symbol => symbol.source === ref.source && symbol.id === ref.id)) draft.symbols = [...draft.symbols, ref];
    search.clear(); sync();
  });
  const offer = el("div", { class: "stack" });

  const repeatPick = el("select", { class: "field", on: { change: () => { repeat = repeatPick.value as Repeat; sync(); } } },
    ...([["none", "einmalig"], ["daily", "jeden Tag"], ["weekly", "wöchentlich"], ["yearly", "jedes Jahr"]] as const)
      .map(([value, label]) => el("option", { text: label, attrs: { value } })));
  const days = el("div", { class: "picker__grid picker__grid--tight" });
  const until = input("date");
  const untilRow = field("Bis", until);
  const repeatRow = el("div", { class: "stack" }, el("div", { class: "row-of" }, field("Wiederholen", repeatPick), untilRow), days);

  const who = el("div", { class: "picker__grid" });
  const showPeople = input("checkbox");
  const showRow = el("label", { class: "choice" }, showPeople, el("span", { text: "Am Board zeigen" }));
  showPeople.checked = draft.showPeople;
  const more = el("details", { class: "more" },
    el("summary", { text: "Weitere Optionen" }),
    el("div", { class: "stack" }, existing ? el("span") : repeatRow, el("span", { class: "lbl", text: "Personen" }), who, showRow));

  const removeButton = button("Löschen", "destructive", () => void erase());
  const handle = openDialog({
    title: titleOf(draft, shown().cards) || "Neuer Termin", closeLabel: "Schließen", wide: true,
    body: [el("div", { class: "stack" }, title, timeRow, wholeRow, seriesLine, kinds, chosen, search.node, offer, more)],
    footer: [existing ? removeButton : el("span"), spacer(),
      button("Abbrechen", "quiet", () => handle.close()), button("Sichern", "primary", () => void save())],
  });
  const heading = handle.dialog.querySelector("h2");

  const read = () => {
    draft.title = title.value.trim() || undefined;
    draft.date = date.value || draft.date;
    if (whole.checked) { draft.start = undefined; draft.end = undefined; }
    else { draft.start = from.value || "09:00"; draft.end = to.value || "09:30"; }
    draft.showPeople = showPeople.checked;
  };

  async function sync() {
    read();
    if (existing && draft.series) counts = { from: (await reachOf(draft.series, draft.date)).length, all: (await reachOf(draft.series)).length };
    if (heading) heading.textContent = titleOf(draft, shown().cards) || "Neuer Termin";
    title.placeholder = derivedName(draft, shown().cards) || "Name";

    fromField.hidden = whole.checked;
    toField.hidden = whole.checked;
    spanField.hidden = !whole.checked;
    if (whole.checked && spanTo.value < draft.date) spanTo.value = draft.date;
    spanTo.min = draft.date;

    const series = draft.series ? shown().series.get(draft.series) : undefined;
    seriesLine.hidden = !draft.series;
    seriesLine.textContent = !draft.series ? "" : series
      ? `↻ ${series.pattern.kind === "daily" ? "jeden Tag" : series.pattern.kind === "yearly" ? "jedes Jahr"
          : `wöchentlich ${series.pattern.weekdays.map(day => weekdays[day]).join(" ")}`} · bis ${dayLabel(series.until)}`
      : "↻ Teil einer Serie";

    kinds.children[0].classList.toggle("primary", mode === "symbols");
    kinds.children[1].classList.toggle("primary", mode === "choice");
    search.node.hidden = mode !== "symbols";
    offer.hidden = mode !== "choice";

    fill(chosen, mode === "symbols"
      ? grid(...draft.symbols.map((symbol, index) => pickerItem(symbol.label, picture(symbol, symbol.label), true,
          () => { draft.symbols = draft.symbols.filter((_, at) => at !== index); void sync(); })))
      : grid(...draft.options.map(id => pickerItem(cardById(id)?.name ?? "?", cardThumb(cardById(id)), true,
          () => { draft.options = draft.options.filter(other => other !== id); void sync(); }))));
    if (!draft.symbols.length && !draft.options.length) fill(chosen, el("p", { class: "empty", text: mode === "choice" ? "noch keine Karte" : "noch kein Symbol" }));

    fill(offer,
      el("p", { class: "small muted", text: "Was zur Wahl steht, sind Karten mit NFC-Tag, die du hinlegst." }),
      grid(...[...shown().cards.values()].filter(card => !draft.options.includes(card.id))
        .map(card => pickerItem(card.name, cardThumb(card), false, () => { draft.options = [...draft.options, card.id]; void sync(); }))),
      button("＋ Neue Karte", "sm", () => editCard({ id: uuid(), name: "", updatedAt: 0 }, async id => {
        draft.options = [...draft.options, id]; await load(); void sync();
      })));

    repeatRow.hidden = existing;
    days.hidden = repeat !== "weekly";
    untilRow.hidden = repeat === "none";
    if (!until.value) until.value = iso(addDays(new Date(`${draft.date}T00:00`), 55));
    fill(days, ...weekdays.map((label, index) => pickerItem(label, el("span"), weekly.includes(index), () => {
      weekly = weekly.includes(index) ? weekly.filter(other => other !== index) : [...weekly, index];
      if (!weekly.length) weekly = [index];
      void sync();
    })));

    fill(who, ...shown().people.map(person => pickerItem(person.name, face(person) ?? el("span"),
      draft.people.includes(person.id), () => {
        draft.people = draft.people.includes(person.id) ? draft.people.filter(other => other !== person.id) : [...draft.people, person.id];
        void sync();
      })));
    showRow.hidden = !draft.people.length;
  }

  const erase = async () => {
    read();
    if (draft.series) {
      const scope = await askScope("löschen", counts);
      if (!scope) return;
      if (scope !== "one") { await dropSeries(draft.series, scope === "from" ? draft.date : undefined); handle.close(); return done(); }
    } else {
      const sure = await confirmDialog({
        title: "Termin löschen", body: `„${titleOf(draft, shown().cards) || "Dieser Termin"}“ am ${dayLabel(draft.date)} wird gelöscht.`,
        confirmLabel: "Löschen", cancelLabel: "Abbrechen", closeLabel: "Schließen", danger: true,
      });
      if (!sure) return;
    }
    await remove(draft.id);
    handle.close();
    done();
  };

  const save = async () => {
    read();
    if (!whole.checked && minute(draft.end!) <= minute(draft.start!)) draft.end = clock(minute(draft.start!) + board.snap);
    if (mode === "symbols") draft.options = []; else { draft.symbols = []; draft.chosen = undefined; }
    const shape = { title: draft.title, start: draft.start, end: draft.end, symbols: draft.symbols,
      options: draft.options, chosen: draft.chosen, people: draft.people, showPeople: draft.showPeople };

    if (existing && draft.series) {
      const scope = await askScope("ändern", counts);
      if (!scope) return;
      if (scope !== "one") { await editSeries(draft.series, shape, scope === "from" ? draft.date : undefined); handle.close(); return done(); }
    }
    if (!existing) {
      /* A multi-day all-day appointment is a daily batch: one record per day, the
         same mechanism a weekly Kita uses, only shorter. */
      const spans = whole.checked && spanTo.value > draft.date && repeat === "none";
      if (spans || repeat !== "none") {
        const pattern: Pattern = spans ? { kind: "daily" }
          : repeat === "weekly" ? { kind: "weekly", weekdays: weekly } : repeat === "yearly" ? { kind: "yearly" } : { kind: "daily" };
        const stop = spans ? spanTo.value : (until.value || draft.date);
        await createSeries(pattern, draft.date, stop < draft.date ? draft.date : stop, shape);
        handle.close();
        return done();
      }
    }
    await put(draft);
    handle.close();
    done();
  };

  for (const control of [title, date, from, to, spanTo]) control.addEventListener("input", () => void sync());
  whole.addEventListener("change", () => void sync());
  void sync();
}
