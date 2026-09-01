import { openDialog, confirmDialog } from "@lautstark/design/dialog";
import { button, el, field, fill, input, spacer } from "../ui.js";
import { addDays, allDay, board, bornOn, cardSays, clock, dateLabel, dayLabel, derivedName, iso, minute, samePattern,
  strays, titleOf, weekdays, type Appointment, type Pattern, type Person } from "../model.js";
import { createSeries, dropSeries, editSeries, put, reachOf, remove, repattern, reshapeOf, seriesFrom, uuid } from "../db.js";
import { cardById, load, shown } from "../store.js";
import { prepare } from "../speech.js";
import { birthdayOf, birthdaySheet } from "./birthday-sheet.js";
import { pictureFor, pictures } from "../symbols.js";
import { cardThumb, grid, picture, pickerItem, face, speechField } from "./pieces.js";
import { symbolSearch } from "./symbol-search.js";
import { cardEditor } from "./card-editor.js";
import { askScope } from "./scope-dialog.js";

type Repeat = "none" | "daily" | "weekly" | "yearly";

export const blankAppointment = (date: string, start?: string): Appointment => ({
  id: uuid(), date, start, end: start ? clock(minute(start) + 30) : undefined,
  symbols: [], options: [], people: [], showPeople: false, updatedAt: 0,
});

export function editAppointment(appointment: Appointment, existing: boolean, done: () => void) {
  /* A birthday has nothing this form can safely change — see birthday-sheet.ts.
     The branch is here rather than at the call site so that every way into the
     editor goes through it, including one somebody adds later. */
  const born = existing ? birthdayOf(appointment, shown().people) : [];
  if (born.length) return birthdaySheet(appointment, born);

  const draft: Appointment = structuredClone(appointment);
  /* A batch brings its own rule into the dialog rather than an empty one, so what
     stands there is what is stored, and changing it changes that. */
  const batch = draft.series ? shown().series.get(draft.series) : undefined;
  let mode: "symbols" | "choice" = draft.options.length ? "choice" : "symbols";
  let repeat: Repeat = batch ? batch.pattern.kind : "none";
  let weekly = batch?.pattern.kind === "weekly" ? [...batch.pattern.weekdays]
    : [(new Date(`${draft.date}T00:00`).getDay() + 6) % 7];
  let counts = { from: 0, all: 0 };
  const anchor = appointment.date;

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

  /* The week's map only knows the symbols that were already on the board, so a
     symbol just picked out of the search has no picture in it and drew as its own
     label. What is picked here is resolved here — once per symbol, and kept, so a
     redraw does not ask the provider again. */
  const known = new Map(shown().pictures);
  const resolve = async () => {
    const missing = draft.symbols.filter(symbol => !pictureFor(known, symbol));
    if (missing.length) for (const [at, url] of await pictures(missing)) known.set(at, url);
  };
  /* The Wahl side is either the cards to choose from or one being made. Held as a
     node rather than as a flag, because `sync` runs on every keystroke in the fields
     above and refilling this while somebody is typing a card's name into it would
     take the caret with it. So `sync` leaves it alone entirely while it is here. */
  const offer = el("div", { class: "stack" });
  let making: HTMLElement | null = null;

  const repeatPick = el("select", { class: "field", on: { change: () => { repeat = repeatPick.value as Repeat; sync(); } } },
    ...([["none", "einmalig"], ["daily", "jeden Tag"], ["weekly", "wöchentlich"], ["yearly", "jedes Jahr"]] as const)
      /* „einmalig" is not an answer a batch can be given here: undoing one is
         deleting it, which is the other button and says what it takes with it. */
      .filter(([value]) => !batch || value !== "none")
      .map(([value, label]) => el("option", { text: label, attrs: { value } })));
  repeatPick.value = repeat;
  const days = el("div", { class: "picker__grid picker__grid--tight" });
  const until = input("date");
  const untilRow = field("Bis", until);
  const repeatRow = el("div", { class: "stack" }, el("div", { class: "row-of" }, field("Wiederholen", repeatPick), untilRow), days);

  const removeButton = button("Löschen", "destructive", () => void erase());
  const saveButton = button("Sichern", "primary", () => void save());
  const wantMore = el("p", { class: "notice bad" });

  const who = el("div", { class: "picker__grid" });
  const showPeople = input("checkbox");
  const showRow = el("label", { class: "choice" }, showPeople, el("span", { text: "Am Board zeigen" }));
  showPeople.checked = draft.showPeople;
  /* How often is as much part of planning as when, so it stands beside the time
     rather than under a fold — for a batch that exists as much as for one being
     made, and where it stops sits in the same row as what it repeats. */
  const more = el("details", { class: "more" },
    el("summary", { text: "Weitere Optionen" }),
    el("div", { class: "stack" }, el("span", { class: "lbl", text: "Personen" }), who, showRow));

  /* What the board says about this appointment. Empty means the name, which is
     the ordinary case: the board draws symbols and never a title, so a title is
     free to carry what the child is not told — a room, a practice, a surname —
     and this is where the two come apart. docs/speech.md. */
  const speech = speechField(
    /* An all-day fact is offered its whole sentence, because that is what it
       says — a word would have to be a noun the day can be, and a trip is not
       one. Everything with a time is offered a word, which has six frames to
       survive. See `dayFact` and docs/speech.md. */
    () => whole.checked
      ? (title.value.trim() ? `Heute ist ${title.value.trim()}.` : "")
      : title.value.trim() || cardSays(shown().cards.get(draft.chosen ?? "")) || "",
    () => {
      const on = draft.people.map(id => shown().people.find(person => person.id === id)).filter(Boolean) as Person[];
      const born = whole.checked ? on.filter(person => bornOn(person, draft.date)) : [];
      const ages = new Set(born.map(person => Number(draft.date.slice(0, 4)) - Number(person.birthday!.slice(0, 4))));
      return {
        /* One person is an address; two is a list, and a list is not an address. */
        who: on.length === 1 ? on[0]!.name : undefined,
        /* The cards, not the appointment's own name: "Jetzt darfst du aussuchen:
           Nachmittagszeit" is the word the parents filed it under, and the child
           is being offered a Laufrad and a Spielplatz. */
        ...(draft.options.length && !draft.chosen
          ? { offering: draft.options.map(id => cardSays(shown().cards.get(id)) ?? "") }
          : {}),
        picked: !!draft.chosen,
        allDay: whole.checked,
        date: draft.date,
        ...(born.length ? { birthday: { names: born.map(person => person.name), age: ages.size === 1 ? [...ages][0] : undefined } } : {}),
        ...(whole.checked && on.length && !born.length && !draft.symbols.length ? { visiting: on.map(person => person.name) } : {}),
      };
    });
  speech.box.value = draft.speech ?? "";

  const handle = openDialog({
    title: titleOf(draft, shown().cards, shown().people) || "Neuer Termin", closeLabel: "Schließen", wide: true,
    /* Two groups, in this order: when it happens, then what the board does with
       it. The Ansage sits at the head of the second rather than at the top of the
       sheet, because what is heard and what is shown are one question asked twice
       — and it sits *above* the symbol rather than below it so that the search,
       which grows to the height of its results, cannot push it around. */
    body: [el("div", { class: "stack" }, timeRow, wholeRow, repeatRow, seriesLine,
      field("Ansage", speech.node), kinds, wantMore, chosen, search.node, offer, more)],
    footer: [existing ? removeButton : el("span"), spacer(),
      button("Abbrechen", "quiet", () => handle.close()), saveButton],
  });
  /* The name field is the heading. A second copy of it above, which cannot be
     typed in, says the same thing twice — so the sheet keeps its accessible name
     and loses the visible one. The field then stands where that heading stood,
     beside the ✕ rather than under it: a head holding nothing but a corner ✕ was
     a whole row of the sheet spent on nothing. */
  const heading = handle.dialog.querySelector("h2");
  heading?.setAttribute("hidden", "");
  handle.dialog.querySelector(".head")?.prepend(title);

  const read = () => {
    draft.title = title.value.trim() || undefined;
    draft.speech = speech.box.value.trim() || undefined;
    draft.date = date.value || draft.date;
    if (whole.checked) { draft.start = undefined; draft.end = undefined; }
    else { draft.start = from.value || "09:00"; draft.end = to.value || "09:30"; }
    draft.showPeople = showPeople.checked;
  };

  async function sync() {
    read();
    /* Where this one sits in the batch is where it was written, not what the day
       field currently says: an unsaved move must not change what "and all
       following" reaches. */
    if (existing && draft.series) counts = { from: (await reachOf(draft.series, anchor)).length, all: (await reachOf(draft.series)).length };
    handle.dialog.setAttribute("aria-label", titleOf(draft, shown().cards, shown().people) || "Neuer Termin");
    title.placeholder = derivedName(draft, shown().cards, shown().people) || "Name";
    speech.draw();

    fromField.hidden = whole.checked;
    toField.hidden = whole.checked;
    spanField.hidden = !whole.checked;
    if (whole.checked && spanTo.value < draft.date) spanTo.value = draft.date;
    spanTo.min = draft.date;

    seriesLine.hidden = !draft.series;
    /* An appointment lying before where the rule starts belongs to the batch but was
       not written by that rule, so the line says from when the rule holds rather
       than claiming it over a day it never covered. */
    seriesLine.textContent = !draft.series ? "" : batch
      ? `↻ ${batch.pattern.kind === "daily" ? "jeden Tag" : batch.pattern.kind === "yearly" ? "jedes Jahr"
          : `wöchentlich ${batch.pattern.weekdays.map(day => weekdays[day]).join(" ")}`} · bis ${dateLabel(batch.until)}`
        + (draft.date < batch.from ? ` · gilt ab ${dateLabel(batch.from)}` : "")
      : "↻ Teil einer Serie";

    kinds.children[0].classList.toggle("primary", mode === "symbols");
    kinds.children[1].classList.toggle("primary", mode === "choice");
    /* A choice carries a symbol of its own now, so the picker stopped being one
       half of a toggle: both kinds answer "what is drawn" the same way, and only
       "what may be picked" belongs to the choice alone. */
    search.node.hidden = false;
    offer.hidden = mode !== "choice";

    await resolve();
    fill(chosen, grid(...draft.symbols.map((symbol, index) => pickerItem(symbol.label, picture(symbol, symbol.label, known), true,
      () => { draft.symbols = draft.symbols.filter((_, at) => at !== index); void sync(); }))));
    if (!draft.symbols.length) fill(chosen, el("p", { class: "empty",
      text: mode === "choice" ? "noch kein Symbol für die Wahl" : "noch kein Symbol" }));

    if (!making) fill(offer,
      /* What is already on offer, removable. It used to share `chosen` with the
         symbols and cannot any more, now that a choice has both. */
      ...(draft.options.length
        ? [grid(...draft.options.map(id => pickerItem(cardById(id)?.name ?? "?", cardThumb(cardById(id)), true,
            () => { draft.options = draft.options.filter(other => other !== id); void sync(); })))]
        : []),
      el("p", { class: "small muted", text: "Was zur Wahl steht, sind Karten mit NFC-Tag, die du hinlegst." }),
      grid(...[...shown().cards.values()].filter(card => !draft.options.includes(card.id))
        .map(card => pickerItem(card.name, cardThumb(card), false, () => { draft.options = [...draft.options, card.id]; void sync(); }))),
      button("＋ Neue Karte", "sm", () => makeCard()));

    days.hidden = repeat !== "weekly";
    untilRow.hidden = repeat === "none";
    if (!until.value) until.value = batch ? batch.until : iso(addDays(new Date(`${draft.date}T00:00`), 55));
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

    /* A choice with one card is not a choice, and one with none is empty. Saying
       so where it is decided beats a message after the fact. */
    const short = mode === "choice" && draft.options.length < 2;
    saveButton.disabled = short;
    wantMore.hidden = !short;
    wantMore.textContent = draft.options.length === 0
      ? "Wähl mindestens zwei Karten aus, zwischen denen das Kind entscheiden kann."
      : "Noch eine Karte: zwischen einer allein gibt es nichts zu wählen.";
  }

  /* Making a card without leaving the appointment being planned. It ends by
     dropping the editor and letting `sync` draw the list again — with the new card
     already offered when there is one, which is the whole reason the button is here
     rather than in the settings. */
  function makeCard() {
    making = cardEditor({ id: uuid(), name: "", updatedAt: 0 }, async id => {
      making = null;
      if (id) { draft.options = [...draft.options, id]; await load(); }
      void sync();
    });
    fill(offer, making);
  }

  const erase = async () => {
    read();
    if (draft.series) {
      const scope = await askScope("löschen", counts);
      if (!scope) return;
      if (scope !== "one") { await dropSeries(draft.series, scope === "from" ? anchor : undefined); handle.close(); return done(); }
    } else {
      const sure = await confirmDialog({
        title: "Termin löschen", body: `„${titleOf(draft, shown().cards, shown().people) || "Dieser Termin"}“ am ${dayLabel(draft.date)} wird gelöscht.`,
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
    /* Rendered here rather than at the key press: planning is a moment somebody
       is already waiting through, and a child pressing a key is not. Not awaited
       — the sheet closes and the cache fills behind it. */
    void prepare(speech.sentences());
    if (!whole.checked && minute(draft.end!) <= minute(draft.start!)) draft.end = clock(minute(draft.start!) + board.snap);
    /* What the child already picked is only wrong if it is no longer on offer.
       Clearing it on every save threw away an answer that was still good. */
    if (mode === "symbols") { draft.options = []; draft.chosen = undefined; }
    else { draft.symbols = []; if (draft.chosen && !draft.options.includes(draft.chosen)) draft.chosen = undefined; }
    /* Without `chosen`: this is what is written across days other than this one,
       and an answer given on Monday is not an answer for Tuesday. */
    const shape = { title: draft.title, start: draft.start, end: draft.end, symbols: draft.symbols,
      options: draft.options, people: draft.people, showPeople: draft.showPeople };

    if (batch) {
      const pattern: Pattern = repeat === "weekly" ? { kind: "weekly", weekdays: [...weekly].sort((one, other) => one - other) }
        : repeat === "yearly" ? { kind: "yearly" } : { kind: "daily" };
      const stop = until.value || batch.until;
      const moved = !samePattern(pattern, batch.pattern);
      /* Where a new rule starts: the appointment somebody opened, and never earlier
         than today. What is already behind us is what was planned, and a rule
         changed now does not get to say otherwise. */
      const now = iso(new Date());
      const cut = moved ? (draft.date > now ? draft.date : now) : batch.from;
      if (moved || stop !== batch.until) {
        const change = await reshapeOf(batch.id, pattern, cut, stop);
        /* Writing days nobody had is not worth a question. Removing days somebody
           may have edited by hand is — and how many of those there are is the half
           of the cost a bare count leaves out. */
        if (change.dropping.length) {
          const own = change.dropping.filter(item => strays(item, draft)).length;
          const sure = await confirmDialog({
            title: "Serie ändern", danger: true, confirmLabel: "Ändern", cancelLabel: "Abbrechen", closeLabel: "Schließen",
            body: [`${change.dropping.length} Termine fallen weg${own ? `, ${own} davon mit eigenen Änderungen` : ""}`,
              change.adding.length ? `${change.adding.length} kommen dazu` : "",
              moved ? `ab ${dateLabel(cut)} — was davor liegt, bleibt wie es ist` : ""].filter(Boolean).join(", ") + ".",
          });
          if (!sure) return;
        }
        const gone = change.dropping.some(item => item.id === draft.id);
        await repattern(batch.id, pattern, cut, stop, { ...draft, ...shape });
        /* The day this one stood on may be one the new rule no longer covers, in
           which case it has just been removed and must not be written back. */
        if (gone) { handle.close(); return done(); }
      }
    }
    if (existing && draft.series) {
      /* Only what the appointment itself says is a change over the batch. A rule
         changed and nothing else is one answer already given. */
      if (!strays(draft, appointment) && draft.date === anchor) { handle.close(); return done(); }
      counts = { from: (await reachOf(draft.series, anchor)).length, all: (await reachOf(draft.series)).length };
      /* The day is the one thing a change over a batch cannot carry: which days a
         batch falls on is what its rule says, and that is a row further up. */
      const moved = draft.date !== anchor;
      const scope = await askScope("ändern", counts,
        moved ? "Der Tag gilt nur für diesen Termin. Wann die Serie stattfindet, steht unter „Wiederholen“." : undefined);
      if (!scope) return;
      if (scope !== "one") {
        await editSeries(draft.series, shape, scope === "from" ? anchor : undefined);
        if (moved) await put(draft);
        handle.close();
        return done();
      }
    }
    if (!draft.series) {
      /* A multi-day all-day appointment is a daily batch: one record per day, the
         same mechanism a weekly Kita uses, only shorter. */
      const spans = whole.checked && spanTo.value > draft.date && repeat === "none";
      if (spans || repeat !== "none") {
        const pattern: Pattern = spans ? { kind: "daily" }
          : repeat === "weekly" ? { kind: "weekly", weekdays: weekly } : repeat === "yearly" ? { kind: "yearly" } : { kind: "daily" };
        const stop = spans ? spanTo.value : (until.value || draft.date);
        const from = draft.date;
        if (existing) await seriesFrom({ ...draft, ...shape }, pattern, stop);
        else await createSeries(pattern, from, stop < from ? from : stop, shape);
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
