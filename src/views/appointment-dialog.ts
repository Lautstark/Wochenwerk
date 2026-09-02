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
import { movable, moved, reorderable } from "./reorder.js";
import { symbolSearch } from "./symbol-search.js";
import { cardEditor } from "./card-editor.js";
import { askScope, type Kind } from "./scope-dialog.js";

type Repeat = "none" | "daily" | "weekly" | "yearly";

/* How long it runs, said the way somebody planning says it. The grid shows this
   in height and the sheet showed it nowhere, so „Von 08:00 Bis 09:00" left the
   one fact both fields are about to be worked out. Halves get their own glyph
   because „1,5 Std" is a number where the others are a duration. */
function lasting(minutes: number): string {
  if (minutes <= 0) return "";
  if (minutes < 60) return `${minutes} Min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (rest === 0) return `${hours} Std`;
  if (rest === 30) return `${hours}½ Std`;
  return `${hours} Std ${rest} Min`;
}

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
  /* A daily batch of all-day appointments is a stretch of days and not a
     repetition: nothing distinguishes „von Montag bis Freitag" from „jeden Tag,
     bis Freitag" once it is written, and nothing needs to — they are the same
     five days. Everything else is a rule, and is asked about as one. */
  const stretch = batch?.pattern.kind === "daily" && batch.allDay;
  const shapeOfBatch = (): Kind => stretch ? "stretch" : "series";

  /* Every control is made once. Only what a change actually affects is refilled,
     which is what keeps a caret where somebody put it. */
  const title = el("input", { class: "title-input", attrs: { type: "text", autocomplete: "off" } });
  const date = input("date"), from = input("time", { attrs: { step: board.snap * 60 } });
  const to = input("time", { attrs: { step: board.snap * 60 } }), spanTo = input("date");
  const whole = input("checkbox"), notHome = input("checkbox");
  const atOpen = input("checkbox"), atClose = input("checkbox");
  title.value = draft.title ?? "";
  date.value = draft.date; from.value = draft.start ?? "09:00"; to.value = draft.end ?? "09:30";
  /* Wo die Strecke aufhört, nicht wo dieser eine Tag ist: bei einem Batch ist
     das die Ausdehnung, die es schon gibt, und bei einem einzelnen Tag ist der
     Tag selbst der Vorschlag. */
  spanTo.value = stretch ? batch!.until : draft.date;
  whole.checked = allDay(draft); notHome.checked = !!draft.away;

  /* One row, and the fields in it appear or not. A second row holding a second
     copy of the day was how the first one lost its input to the other.

     Under each field hangs the switch that answers it away: Ganztägig under the
     day, the two edges of the day under the times they replace. Standing free in
     a row of their own they belonged to nothing — and Ganztägig, which sat below
     the times it removes, made the sheet jump upwards under the pointer at the
     moment it was clicked. Where each one lives now settles both: Ganztägig is in
     the only column that never goes, and the other two are in the columns it
     takes with it, so nothing has to remember to hide them. */
  const switchUnder = (box: HTMLInputElement, text: string, at?: string) =>
    el("label", { class: "choice" }, box,
      el("span", {}, el("span", { text }), at ? el("span", { class: "muted", text: ` ${at}` }) : null));
  const dayField = field("Tag", date), fromField = field("Von", from);
  /* The one label with something on its far end: how long it lasts, beside the
     field that ends it. The grid says it in height and the sheet never did. */
  const lasts = el("span", { class: "lbl__aside" });
  const toField = el("label", { class: "field-row" },
    el("span", { class: "lbl lbl--split" }, el("span", { text: "Bis" }), lasts), to);
  const spanField = field("Bis", spanTo);
  /* One switch under each of the two fields, which is also what keeps the row
     level: two of them stacked under „Tag" left the column beside it a hand
     shorter than its neighbour.

     And it is the right field by meaning as well — a day the household is
     somewhere else is a day that lasts, and how many of them there are is what
     stands above it. The column carries the switch whenever the appointment is
     all-day; the field inside it only where it can still do something, which is
     everywhere except an all-day appointment inside a batch that is not a
     stretch. There the switch stands alone rather than going: a weekly all-day
     Friday somewhere else is unusual and not impossible, and a control that
     disappears for it would be a capability nobody could find. */
  const spanCol = el("div", { class: "field-col" }, spanField,
    switchUnder(notHome, "Wir sind nicht zu Hause"));
  const dayCol = el("div", { class: "field-col" }, dayField, switchUnder(whole, "Ganztägig"));
  const fromCol = el("div", { class: "field-col" }, fromField, switchUnder(atOpen, "ab dem Aufstehen", board.from));
  const toCol = el("div", { class: "field-col" }, toField, switchUnder(atClose, "bis zum Schlafengehen", board.to));
  const timeRow = el("div", { class: "row-of row-of--top" }, dayCol, fromCol, toCol, spanCol);
  const seriesLine = el("p", { class: "small muted" });

  /* The two edges are a shortcut, not a third thing to store: ticked means the
     time already *is* the edge of the board's day, so an appointment that starts
     at seven arrives with the box ticked and no record has to say so. Unticking
     puts back what was there before rather than leaving the box ticked over a
     time nobody chose. */
  let priorFrom = from.value, priorTo = to.value;
  atOpen.addEventListener("change", () => {
    if (atOpen.checked) { priorFrom = from.value; from.value = board.from; }
    else from.value = priorFrom === board.from ? clock(minute(board.from) + 60) : priorFrom;
    void sync();
  });
  atClose.addEventListener("change", () => {
    if (atClose.checked) { priorTo = to.value; to.value = board.to; }
    else to.value = priorTo === board.to ? clock(Math.max(minute(from.value) + 30, minute(board.to) - 60)) : priorTo;
    void sync();
  });

  /* What the two sides differ in is whether the appointment is already answered,
     so that is what they are named after. „Symbole" named the half rather than the
     answer — both sides carry symbols now — and „Das Kind wählt" said it in a
     whole sentence beside a one-word sibling.

     Bare buttons, and the selection rides `aria-pressed`: that is what
     components.css paints a `.segmented` from, and the warning above that rule
     says this has already been got wrong twice in the family. Toggling `.primary`
     instead drew the chosen half as a full accent plate with black ink — a
     primary *action* sitting inside a chooser — and left the control saying
     nothing at all about which half was chosen. */
  const kindButton = (label: string, pick: () => void) =>
    el("button", { text: label, attrs: { type: "button" }, on: { click: () => { pick(); void sync(); } } });
  const kinds = el("div", { class: "segmented" },
    kindButton("steht fest", () => { mode = "symbols"; }),
    /* Dropped on the way over rather than at the save that would have dropped
       them anyway, so what stands in the sheet is what will be stored. */
    kindButton("Kind wählt", () => { mode = "choice"; draft.symbols = []; speech.fold.open = true; }));
  /* A chooser with no question above it. Both halves answer what the board does
     with this appointment, so that is what the label says. */
  const kindsRow = el("div", {}, el("span", { class: "lbl", text: "Am Board" }), kinds);
  /* The order is not a preference about this sheet, it is what the board reads
     from left to right, so the tiles are dragged into it rather than picked again
     in the right order. The grid around them is made once and only refilled: the
     handlers sit on it, and a node replaced mid-drag is a drag that stops. */
  const picked = reorderable(grid(), (from, to) => {
    draft.symbols = moved(draft.symbols, from, to);
    /* The tiles are new after the redraw, so the one that was moved is found
       again by where it landed — otherwise a second key press has nothing under
       it and the arrows move one symbol once. */
    void sync().then(() => picked.querySelectorAll<HTMLElement>("[data-move]")[to]?.focus());
  });
  const ordering = el("p", { class: "small muted",
    text: "Zieh sie in die Reihenfolge, in der sie am Board stehen — oder ← und →." });
  const chosen = el("div", { class: "chosen" }, picked, ordering);
  /* The search stood open beside the ＋ tile that focuses it — two ways to the
     same thing, forty pixels apart, and one of them a full-width field on a sheet
     that is already long. It is what the ＋ opens, so it waits until the ＋ is
     pressed. It stays open after that: adding a second symbol is the common case. */
  let searching = false;
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
  const saveButton = button("Fertig", "primary", () => void save());
  const wantMore = el("p", { class: "notice bad" });

  const who = el("div", { class: "picker__grid" });
  const showPeople = input("checkbox");
  const showRow = el("label", { class: "choice" }, showPeople, el("span", { text: "Am Board zeigen" }));
  showPeople.checked = draft.showPeople;
  /* How often is as much part of planning as when, so it stands beside the time
     rather than under a fold — for a batch that exists as much as for one being
     made, and where it stops sits in the same row as what it repeats. */
  /* „Weitere Optionen" named a drawer rather than what is in it, and what is in
     it is people and one question about them. Closed, it also said nothing about
     the two people on „Oma kommt" — so the heading carries who is inside, which
     is the shared panel summary's own answer to exactly this. */
  const peopleState = el("span", { class: "state" });
  const more = el("details", { class: "more" },
    el("summary", {}, el("span", { class: "section", text: "Personen" }), peopleState),
    el("div", { class: "stack" }, who, showRow));

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
        /* On the mode rather than on the count: a choice with no cards added yet
           is still a choice, and a name typed into it would still never be said.
           Keyed on the count, the field fell back to "Ohne Namen wird nichts
           gesagt" — which promises that a name would change something. */
        ...(mode === "choice" && !draft.chosen
          ? { offering: draft.options.map(id => cardSays(shown().cards.get(id)) ?? "") }
          : {}),
        picked: !!draft.chosen,
        allDay: whole.checked,
        away: whole.checked && notHome.checked,
        date: draft.date,
        ...(born.length ? { birthday: { names: born.map(person => person.name), age: ages.size === 1 ? [...ages][0] : undefined } } : {}),
        ...(whole.checked && on.length && !born.length && !draft.symbols.length ? { visiting: on.map(person => person.name) } : {}),
      };
    });
  speech.box.value = draft.speech ?? "";

  /* A choice has no Ansage of its own — what is said comes from the cards it
     offers and, once something picked, from the card that was picked. So there is
     no word to type and the field goes: anything typed into it was never stored,
     which made it an input that did nothing.

     What stays is the listening. Those four sentences are not per-card and can be
     heard nowhere else — a card's own word is played on the card, but „Jetzt
     darfst du aussuchen: Spielplatz oder Laufrad" is built here, out of the cards
     this appointment happens to offer, and exists on none of them. The fold's own
     summary says which four they are, so the label above it would say it twice. */
  const ansageLabel = el("span", { class: "lbl", text: "Ansage" });
  const ansage = el("label", { class: "field-row" }, ansageLabel, speech.node);

  const handle = openDialog({
    title: titleOf(draft, shown().cards, shown().people) || "Neuer Termin", closeLabel: "Schließen", wide: true,
    /* Two groups, in this order: when it happens, then what the board does with
       it. What is *said* closes the second group rather than opening it — it is
       read off what is shown, so it cannot be settled before the symbol or the
       cards it is read from. It stood above them and separated the times from the
       thing that happens with the tallest block in the sheet. */
    body: [el("div", { class: "stack" }, timeRow, repeatRow, seriesLine,
      kindsRow, wantMore, chosen, search.node, offer, ansage, more)],
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
  /* `.title-input` is a field that does not look like one until it is asked to,
     which is the family's answer and the right one for a name standing where a
     heading stands. On a new appointment nothing has asked it yet, so it reads as
     the sheet's title and says „Name". The caret is what asks: `showModal` would
     otherwise leave focus on the ✕. */
  if (!existing) title.focus();

  const read = () => {
    draft.title = title.value.trim() || undefined;
    draft.speech = speech.box.value.trim() || undefined;
    draft.date = date.value || draft.date;
    if (whole.checked) { draft.start = undefined; draft.end = undefined; }
    else { draft.start = from.value || "09:00"; draft.end = to.value || "09:30"; }
    /* Absent rather than false where it was not ticked: a flag nobody set is one
       the record does not carry, and every other optional field here is written
       the same way. */
    draft.away = whole.checked && notHome.checked ? true : undefined;
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

    fromCol.hidden = whole.checked;
    toCol.hidden = whole.checked;
    spanCol.hidden = !whole.checked;
    /* One field for one fact, and the fact is where the stretch stops.
       Beside the day it is what a person came to change: „vom 4. bis zum 6."
       is how somebody says four days away, and it is how they change them.
       Under Wiederholen the same date is the end of a rule, and it stands next
       to a select reading „jeden Tag" — which turns four days at a
       grandmother's into a repetition on the one screen where somebody is
       looking at what it is. So a stretch carries the field here and no
       Wiederholen row at all, and a repetition carries the row and no field. */
    spanField.hidden = !!draft.series && !stretch;
    repeatRow.hidden = !!stretch;
    /* Derived, never stored: ticked means the time already is that edge of the
       day. Written after the columns are placed so that a time changed by hand
       unticks the box on the same pass. */
    atOpen.checked = from.value === board.from;
    atClose.checked = to.value === board.to;
    const runs = minute(to.value) - minute(from.value);
    lasts.textContent = whole.checked ? "" : lasting(runs);
    if (whole.checked && spanTo.value < draft.date) spanTo.value = draft.date;
    spanTo.min = draft.date;

    /* „↻ jeden Tag · bis 6.9." is the same claim in words. A stretch says where
       it stops in its own field and needs no second line about a rule. */
    seriesLine.hidden = !draft.series || !!stretch;
    /* An appointment lying before where the rule starts belongs to the batch but was
       not written by that rule, so the line says from when the rule holds rather
       than claiming it over a day it never covered. */
    seriesLine.textContent = !draft.series ? "" : batch
      ? `↻ ${batch.pattern.kind === "daily" ? "jeden Tag" : batch.pattern.kind === "yearly" ? "jedes Jahr"
          : `wöchentlich ${batch.pattern.weekdays.map(day => weekdays[day]).join(" ")}`} · bis ${dateLabel(batch.until)}`
        + (draft.date < batch.from ? ` · gilt ab ${dateLabel(batch.from)}` : "")
      : "↻ Teil einer Serie";

    kinds.children[0].setAttribute("aria-pressed", String(mode === "symbols"));
    kinds.children[1].setAttribute("aria-pressed", String(mode === "choice"));
    /* A choice has no symbol of its own to pick. The board draws a question mark
       over it while it is open and the picked card's picture after that, so
       `symbols` is never what is drawn on one — the save has always thrown away
       whatever was picked here. The picker was a control with nothing behind it,
       and the search under it invited using one. What a choice is made of is
       cards, and that is the one list it shows. */
    search.node.hidden = mode === "choice" || !searching;
    chosen.hidden = mode === "choice";
    offer.hidden = mode !== "choice";
    /* Nothing to type while the cards do the talking, so the field and its label
       go and the sentences stand alone. Opening the fold is not done here: `sync`
       runs on every keystroke in the sheet, so a fold opened from it is a fold
       nobody can close again. It is opened where the mode is chosen. */
    const saidByCards = mode === "choice" && !draft.chosen;
    speech.row.hidden = saidByCards;
    ansageLabel.hidden = saidByCards;

    await resolve();
    /* The slot is always the last tile, filled or not: „noch kein Symbol" was a
       sentence standing where the thing itself belongs, and it said what was
       missing without offering to fix it. This is the shape of the tile that is
       missing, and pressing it puts the caret in the search. */
    fill(picked,
      ...draft.symbols.map((symbol, index) => movable(pickerItem(symbol.label, picture(symbol, symbol.label, known), true,
        () => { draft.symbols = draft.symbols.filter((_, at) => at !== index); void sync(); }))),
      el("button", { class: "picker__item picker__item--add", attrs: { type: "button" },
        on: { click: () => { searching = true; void sync().then(() => search.focus()); } } },
        el("span", { class: "picker__add", text: "＋" }),
        el("span", { class: "small", text: "Symbol" })));
    /* Nothing to put in an order until there are two of them. */
    ordering.hidden = draft.symbols.length < 2;

    const named = draft.people
      .map(id => shown().people.find(person => person.id === id)?.name)
      .filter(Boolean) as string[];
    peopleState.textContent = named.length
      ? named.join(", ") + (draft.showPeople ? " · am Board" : "")
      : "niemand";

    if (!making) fill(offer,
      /* What is already on offer, removable. It used to share `chosen` with the
         symbols and cannot any more, now that a choice has both. */
      ...(draft.options.length
        ? [grid(...draft.options.map(id => pickerItem(cardById(id)?.name ?? "?", cardThumb(cardById(id)), true,
            () => { draft.options = draft.options.filter(other => other !== id); void sync(); })))]
        : []),
      el("p", { class: "small muted", text: "Karten mit NFC-Tag, die du hinlegst." }),
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
       so where it is decided beats a message after the fact.

       A fixed appointment with no symbol is the same kind of empty, and it was
       allowed: the board draws it as a blank card, because `drawnSymbols` finds
       nothing and `card` paints nothing. One exception, and it is a real one —
       an all-day appointment carrying people and no symbol is the visit, and the
       visit is *defined* by having no symbol: `couldSay` builds „und Oma
       besucht dich" from exactly that shape, and the board draws it as a pill of
       faces. Requiring a symbol everywhere would abolish it. */
    const visiting = whole.checked && draft.people.length > 0;
    const short = mode === "choice" && draft.options.length < 2;
    const bare = mode === "symbols" && !draft.symbols.length && !visiting;
    saveButton.disabled = short || bare;
    wantMore.hidden = !short && !bare;
    wantMore.textContent = bare
      ? "Such ein Symbol aus, sonst bleibt die Karte am Board leer."
      : draft.options.length === 0
        ? "Wähl mindestens zwei Karten aus."
        : "Noch eine Karte — zwischen einer allein gibt es nichts zu wählen.";
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
      const scope = await askScope("löschen", counts, { kind: shapeOfBatch() });
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
    /* What a batch writes across its days is everything the appointment says
       except the four things that belong to a day rather than to the batch —
       which is `Shape`, and is taken by leaving those out rather than by naming
       what stays. Named, it silently dropped whatever was added to the record
       afterwards: `speech` had been missing from this list since it existed, so
       an Ansage typed on a series was thrown away on save, and `away` joined it
       the day it was written. A list of fields cannot fail to compile when it
       falls behind; leaving fields out cannot fall behind at all.

       `chosen` is one of the four on purpose: this is written across days other
       than this one, and an answer given on Monday is not an answer for
       Tuesday. */
    const { id: _id, date: _date, series: _batch, chosen: _chosen, updatedAt: _at, ...shape } = draft;

    if (batch) {
      const pattern: Pattern = repeat === "weekly" ? { kind: "weekly", weekdays: [...weekly].sort((one, other) => one - other) }
        : repeat === "yearly" ? { kind: "yearly" } : { kind: "daily" };
      const stop = (stretch ? spanTo.value : until.value) || batch.until;
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
        /* A cut leaves a second batch, and it is the one this day is now in — so
           what follows changes that one and not the stretch behind it. */
        draft.series = (await repattern(batch.id, pattern, cut, stop)).series;
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
      const scope = await askScope("ändern", counts, { kind: shapeOfBatch(),
        note: moved ? "Der Tag gilt nur für diesen Termin. Wann die Serie stattfindet, steht unter „Wiederholen“." : undefined });
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

  /* Arriving at one is the other way into that state, and there the list is the
     whole of the block — so it stands open rather than as a summary of itself. */
  if (mode === "choice" && !draft.chosen) speech.fold.open = true;

  for (const control of [title, date, from, to, spanTo]) control.addEventListener("input", () => void sync());
  whole.addEventListener("change", () => void sync());
  /* Redrawn like the rest: what it changes is which sentences the Ansage fold
     lists, and a fold that still shows the old set is a fold that lies about
     what the board will say. */
  notHome.addEventListener("change", () => void sync());
  void sync();
}
