import "./kalender.css";
import { openDialog, confirmDialog } from "@lautstark/design/dialog";
import { announcer } from "@lautstark/design/toast";
import { addDays, allDay, appointmentTone, board, bornOn, clock, dayLabel, derivedName, iso, lanesOf, minute, mondayOf,
  occurrences, shownCards, snapped, titleOf, TONES, toneOf, undecided, weekdays, type Appointment, type Card,
  type Pattern, type Person, type Series, type SymbolRef } from "./model.js";
import { allCards, allPeople, allSeries, createSeries, dropSeries, editSeries, put, putCard, putPerson,
  reachOf, remove, removeCard, removePerson, seed, setBirthday, uuid, week } from "./db.js";
import { connect, foldGerman, forget, metacom, needsAttention, pictureFor, pictures, PROVIDER_IDS, rebuild,
  reconnect, refFor, restore, says, search, supportsPicker, useFolderFiles, useZip, type ProviderId } from "./symbols.js";

/* The calendar is where appointments are kept. It writes the records the board
   reads and is shaped like the calendars people already use: a week of columns,
   hours down the side, all-day entries in a row of their own. */

const HOUR = 46;
const app = document.querySelector<HTMLElement>("#app")!;
let offset = 0;
let people: Person[] = [], series: Series[] = [], appointments: Appointment[] = [], cardList: Card[] = [];
let cards = new Map<string, Card>();
let urls = new Map<string, string>();
let gridFrom = snapped(board.from), gridTo = snapped(board.to);
let talk: ReturnType<typeof announcer> | null = null;

const monday = () => addDays(mondayOf(new Date()), offset * 7);
const dates = () => Array.from({ length: 7 }, (_, index) => iso(addDays(monday(), index)));
const escape = (text: string) => text.replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
const personById = (id: string) => people.find(person => person.id === id);
const count = (many: number, one: string, more: string) => `${many} ${many === 1 ? one : more}`;
const matches = (haystack: string, needle: string) => foldGerman(haystack).includes(foldGerman(needle));
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "") => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};
function button(label: string, className: string, onClick: () => void) {
  const node = el("button", `btn ${className}`);
  node.type = "button";
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

function face(person: Person | undefined, size = "") {
  if (!person) return "";
  const inner = person.photo ? `<img src="${person.photo}" alt="" />` : escape(person.initials);
  return `<span class="face ${size}" style="--tone:${person.tone}" title="${escape(person.name)}">${inner}</span>`;
}
function tile(symbol: SymbolRef | undefined, name: string, known = urls) {
  const url = symbol ? pictureFor(known, symbol) : null;
  return `<span class="tile" title="${escape(name)}">${url ? `<img src="${url}" alt="" />` : `<span class="gap">${escape(name)}</span>`}</span>`;
}
const cardTile = (id: string, known = urls) => tile(cards.get(id)?.symbol, cards.get(id)?.name ?? "?", known);
/** What an appointment shows in the calendar: its own symbols, or the cards it offers. */
const facesOf = (appointment: Appointment): { symbol?: SymbolRef; name: string }[] =>
  appointment.options.length
    ? shownCards(appointment).map(id => ({ symbol: cards.get(id)?.symbol, name: cards.get(id)?.name ?? "?" }))
    : appointment.symbols.map(symbol => ({ symbol, name: symbol.label }));

/* The window the grid shows: the board's, widened to whole hours by anything the
   week actually contains, so nothing is planned outside what is drawn. */
function measure() {
  const times = appointments.filter(appointment => !allDay(appointment))
    .flatMap(appointment => [snapped(appointment.start!), snapped(appointment.end!)]);
  const from = snapped(board.from), to = snapped(board.to);
  gridFrom = Math.floor(Math.min(from, ...times) / 60) * 60;
  gridTo = Math.ceil(Math.max(to, ...times) / 60) * 60;
}

function render() {
  measure();
  const today = iso(new Date());
  const now = new Date();
  const nowAt = now.getHours() * 60 + now.getMinutes();
  const height = ((gridTo - gridFrom) / 60) * HOUR;
  const hours = Array.from({ length: (gridTo - gridFrom) / 60 }, (_, index) => gridFrom + index * 60);

  const heads = dates().map((date, index) =>
    `<div class="head${date === today ? " today" : ""}"><b>${weekdays[index]}</b><span>${Number(date.slice(8))}</span></div>`).join("");

  const wholeRow = dates().map(date => {
    const mine = appointments.filter(appointment => appointment.date === date && allDay(appointment));
    return `<div class="whole-cell" data-new-whole="${date}">${mine.map(appointment => {
      const name = titleOf(appointment, cards);
      return `<button class="whole" data-edit="${appointment.id}" style="--tone:${appointmentTone(appointment, cards)}">
        ${facesOf(appointment).map(item => tile(item.symbol, item.name)).join("")}
        <span class="whole-name">${escape(name || appointment.people.map(id => personById(id)?.name).filter(Boolean).join(", ") || "Ganztägig")}</span>
        ${appointment.people.map(id => { const person = personById(id); return `${person && bornOn(person, date) ? "👑" : ""}${face(person, "sm")}`; }).join("")}
        ${appointment.series ? `<span class="loop">↻</span>` : ""}
      </button>`;
    }).join("")}</div>`;
  }).join("");

  const gutter = hours.map(at => `<div class="hour" style="height:${HOUR}px"><span>${clock(at)}</span></div>`).join("");
  const columns = dates().map(date => {
    const mine = appointments.filter(appointment => appointment.date === date && !allDay(appointment));
    const blocks = lanesOf(mine).map(({ appointment, lane, lanes }) => {
      const top = ((snapped(appointment.start!) - gridFrom) / 60) * HOUR;
      /* Short appointments keep a floor so their name still fits; two of them may
         overlap by a few pixels rather than both being unreadable. */
      const tall = Math.max(26, ((snapped(appointment.end!) - snapped(appointment.start!)) / 60) * HOUR);
      const width = 100 / lanes, left = lane * width;
      const name = titleOf(appointment, cards) || (undecided(appointment) ? "Auswahl" : "Termin");
      const tone = appointmentTone(appointment, cards);
      const span = `${appointment.start}–${appointment.end}`;
      /* The time is not printed: where the block sits and how tall it is already
         says it. It stays in the tooltip for the case where that is not enough. */
      return `<button class="event${undecided(appointment) ? " open" : ""}${tall < 40 ? " tight" : ""}" data-edit="${appointment.id}"
        title="${escape(name)} · ${span}" style="--tone:${tone};top:${top}px;height:${tall - 2}px;left:calc(${left}% + 2px);width:calc(${width}% - 4px)">
        <span class="event-name">${escape(name)}</span>
        <span class="event-meta">${appointment.people.map(id => face(personById(id), "sm")).join("")}${appointment.series ? `<span class="loop">↻</span>` : ""}</span>
      </button>`;
    }).join("");
    const line = date === today && nowAt >= gridFrom && nowAt <= gridTo
      ? `<div class="now" style="top:${((nowAt - gridFrom) / 60) * HOUR}px"></div>` : "";
    return `<div class="col${date === today ? " today" : ""}" data-day="${date}" style="height:${height}px">
      ${hours.map((_, index) => `<div class="rule" style="top:${index * HOUR}px"></div>`).join("")}
      ${line}${blocks}</div>`;
  }).join("");

  const label = `${dayLabel(iso(monday()))} – ${dayLabel(iso(addDays(monday(), 6)))} ${monday().getFullYear()}`;
  app.innerHTML = `
    <div class="shell">
      <header class="top">
        <div class="nav">
          <button class="btn quiet icon" data-week="-1" aria-label="Vorige Woche">‹</button>
          <button class="btn quiet icon" data-week="1" aria-label="Nächste Woche">›</button>
          <button class="btn quiet sm" data-week="0">Heute</button>
          <b>${label}</b>
        </div>
        <div class="nav">
          <a class="btn quiet sm" href="/" target="_blank" rel="noopener">Symbolansicht ↗</a>
          <button class="btn sm" data-settings>Einstellungen</button>
        </div>
      </header>
      <div class="cal">
        <div class="cal-head"><div class="corner"></div>${heads}</div>
        <div class="cal-whole"><div class="corner">ganztägig</div>${wholeRow}</div>
        <div class="cal-body"><div class="gutter">${gutter}</div>${columns}</div>
      </div>
      <p class="line" role="status"></p>
    </div>`;
  talk = announcer(app.querySelector<HTMLElement>(".line")!, { rest: 4000, onRest: node => { node.textContent = ""; } });
}

async function load() {
  [appointments, people, series, cardList] = await Promise.all([week(monday()), allPeople(), allSeries(), allCards()]);
  cards = new Map(cardList.map(card => [card.id, card]));
  urls = await pictures([
    ...appointments.flatMap(appointment => appointment.symbols),
    ...cardList.map(card => card.symbol).filter(Boolean) as SymbolRef[],
  ]);
  render();
}
const note = (text: string) => talk?.say(text);

const blank = (date: string, start?: string): Appointment => ({
  id: uuid(), date, start, end: start ? clock(minute(start) + 30) : undefined,
  symbols: [], options: [], people: [], showPeople: false, updatedAt: 0,
});

/* A series can be gone while its appointments remain — it was never authoritative. */
const patternSays = (item?: Series) => !item ? "Teil einer Serie"
  : item.pattern.kind === "daily" ? "jeden Tag"
  : item.pattern.kind === "yearly" ? "jedes Jahr"
  : `wöchentlich ${item.pattern.weekdays.map(day => weekdays[day]).join(" ")}`;

/** Where a repetition stops: a date, or a number of times turned into one. */
function boundFor(pattern: Pattern, from: string, times: number): string {
  let at = from, seen = 0;
  for (let step = 0; step < 4000 && seen < times; step++) {
    at = iso(addDays(new Date(`${from}T00:00`), step));
    if (occurrences(pattern, at, at).length) seen++;
  }
  return at;
}

/* A card is a household object: a laminated picture with an NFC tag on it, laid
   out when a choice is offered. It is a record because it exists in the world and
   is reused — the same Spielplatz card is the same card on every afternoon it is
   offered, and its spoken line and its tag belong to it, not to an appointment. */
function editCard(card: Card, after: (id: string) => void) {
  const draft: Card = structuredClone(card);
  let source: ProviderId = "metacom";
  let results: SymbolRef[] = [];
  const panel = el("div", "form");
  const foot = el("div", "foot-actions");
  const handle = openDialog({ title: draft.name ? "Karte" : "Neue Karte", closeLabel: "Schließen", body: [panel], footer: [foot] });

  const read = () => {
    const data = new FormData(panel.querySelector("form")!);
    draft.name = String(data.get("name") || "").trim();
    draft.speech = String(data.get("speech") || "").trim() || undefined;
    draft.nfc = String(data.get("nfc") || "").trim().toUpperCase() || undefined;
    source = String(data.get("source") || source) as ProviderId;
  };
  const paint = async () => {
    const known = await pictures([...(draft.symbol ? [draft.symbol] : []), ...results]);
    panel.innerHTML = `<form>
      <label><span class="lbl">Name</span><input class="field" name="name" value="${escape(draft.name)}" placeholder="z. B. Spielplatz" autocomplete="off" /></label>
      <label><span class="lbl">Ansage <span class="muted">— was gesagt wird, wenn die Karte zur Wahl steht</span></span>
        <input class="field" name="speech" value="${escape(draft.speech ?? "")}" placeholder="Wir gehen auf den Spielplatz." autocomplete="off" /></label>
      <label><span class="lbl">NFC-Nummer <span class="muted">— die Kennung des Tags auf der Karte</span></span>
        <input class="field" name="nfc" value="${escape(draft.nfc ?? "")}" placeholder="04A1B2C3" autocomplete="off" /></label>
      <span class="lbl">Farbe</span>
      <div class="tones">${TONES.map(tone =>
        `<button type="button" class="tone${toneOf(draft) === tone ? " on" : ""}" data-tone="${tone}" style="--tone:${tone}" aria-label="Farbe"></button>`).join("")}</div>
      <span class="lbl">Symbol</span>
      <div class="chips">${draft.symbol
        ? `<button type="button" class="chip" data-clear>${tile(draft.symbol, draft.symbol.label, known)}${escape(draft.symbol.label)} ✕</button>`
        : `<span class="empty">noch keins</span>`}</div>
      <div class="pair find">
        <label><span class="lbl">Suchen</span><input class="field" name="query" placeholder="z. B. Spielplatz" autocomplete="off" /></label>
        <label><span class="lbl">Quelle</span><select class="field" name="source">${PROVIDER_IDS.map(id =>
          `<option value="${id}"${source === id ? " selected" : ""}>${id === "metacom" ? "METACOM" : "ARASAAC"}</option>`).join("")}</select></label>
      </div>
      <div class="hits">${results.map((ref, index) => {
        const url = pictureFor(known, ref);
        return `<button type="button" class="hit" data-take="${index}" title="${escape(ref.label)}">${url ? `<img src="${url}" alt="" />` : `<span class="gap">${escape(ref.label)}</span>`}</button>`;
      }).join("")}</div>`;
    foot.replaceChildren(el("span", "spacer"),
      button("Abbrechen", "quiet", () => handle.close()),
      button("Sichern", "primary", () => void save()));
  };
  const save = async () => {
    read();
    if (!draft.name) { note("Die Karte braucht einen Namen."); return; }
    if (!draft.tone) draft.tone = TONES[cardList.length % TONES.length];
    await putCard(draft);
    cardList = await allCards();
    cards = new Map(cardList.map(item => [item.id, item]));
    urls = await pictures([...appointments.flatMap(item => item.symbols), ...cardList.map(item => item.symbol).filter(Boolean) as SymbolRef[]]);
    handle.close();
    after(draft.id);
  };
  let typing = 0;
  panel.addEventListener("input", event => {
    const target = event.target as HTMLInputElement;
    read();
    if (target.name !== "query") return;
    clearTimeout(typing);
    const query = target.value.trim();
    typing = window.setTimeout(async () => {
      results = query.length < 2 ? [] : (await search(source, query).catch(() => [])).slice(0, 18).map(candidate => refFor(source, candidate));
      await paint();
      const field = panel.querySelector<HTMLInputElement>('[name="query"]')!;
      field.value = query; field.focus();
    }, 250);
  });
  panel.addEventListener("click", async event => {
    const target = (event.target as HTMLElement).closest("[data-take],[data-clear],[data-tone]") as HTMLElement | null;
    if (!target) return;
    read();
    if (target.dataset.tone) draft.tone = target.dataset.tone;
    else if (target.dataset.clear !== undefined) draft.symbol = undefined;
    else {
      const ref = results[Number(target.dataset.take)];
      draft.symbol = ref;
      if (!draft.name) draft.name = ref.label;
    }
    await paint();
  });
  void paint();
}

type Reach = "one" | "from" | "all";
function edit(appointment: Appointment, existing: boolean) {
  const draft: Appointment = structuredClone(appointment);
  let mode: "fixed" | "choice" = draft.options.length ? "choice" : "fixed";
  let whole = allDay(draft);
  let spanTo = draft.date;
  let repeat: "none" | "daily" | "weekly" | "yearly" = "none";
  let weekly = [(new Date(`${draft.date}T00:00`).getDay() + 6) % 7];
  let endBy: "until" | "times" = "until";
  let findWho = "";
  let source: ProviderId = "metacom";
  let results: SymbolRef[] = [];
  let reach: Reach = "one";
  let counts = { from: 0, all: 0 };
  const mine = () => series.find(item => item.id === draft.series);

  const panel = el("div", "form");
  const foot = el("div", "foot-actions");
  const handle = openDialog({ title: existing ? "Termin" : "Neuer Termin", closeLabel: "Schließen", body: [panel], footer: [foot], wide: true });

  const read = () => {
    const data = new FormData(panel.querySelector("form")!);
    draft.date = String(data.get("date") || draft.date);
    draft.title = String(data.get("title") || "").trim() || undefined;
    whole = data.get("whole") === "on";
    if (whole) { draft.start = undefined; draft.end = undefined; spanTo = String(data.get("spanTo") || draft.date); }
    else { draft.start = String(data.get("start") || draft.start || "09:00"); draft.end = String(data.get("end") || draft.end || "09:30"); }
    draft.showPeople = data.get("showPeople") === "on";
    findWho = String(data.get("findWho") || "");
    source = String(data.get("source") || source) as ProviderId;
    if (!existing) {
      repeat = String(data.get("repeat") || "none") as typeof repeat;
      endBy = String(data.get("endBy") || "until") as typeof endBy;
    }
  };
  const shape = () => ({ title: draft.title, start: draft.start, end: draft.end, symbols: draft.symbols, options: draft.options, chosen: draft.chosen, people: draft.people, showPeople: draft.showPeople });

  const paint = async () => {
    if (existing && draft.series) counts = { from: (await reachOf(draft.series, draft.date)).length, all: (await reachOf(draft.series)).length };
    const known = await pictures([...draft.symbols, ...results]);
    const whoOffered = people.filter(person => !draft.people.includes(person.id) && (!findWho || matches(person.name, findWho))).slice(0, 8);
    panel.innerHTML = `<form>
      <label><span class="lbl">Name <span class="muted">— leer heißt: nach der Aktivität</span></span>
        <input class="field" name="title" value="${escape(draft.title ?? "")}" placeholder="${escape(derivedName(draft, cards) || "z. B. Elternabend")}" autocomplete="off" /></label>
      <div class="pair">
        <label><span class="lbl">Tag</span><input class="field" type="date" name="date" value="${draft.date}" /></label>
        ${whole
          ? `<label><span class="lbl">Bis <span class="muted">— für mehrtägige</span></span><input class="field" type="date" name="spanTo" value="${spanTo}" min="${draft.date}" /></label>`
          : `<label><span class="lbl">Von</span><input class="field" type="time" step="${board.snap * 60}" name="start" value="${draft.start ?? "09:00"}" /></label>
             <label><span class="lbl">Bis</span><input class="field" type="time" step="${board.snap * 60}" name="end" value="${draft.end ?? "09:30"}" /></label>`}
      </div>
      <label class="check"><input type="checkbox" name="whole"${whole ? " checked" : ""} /> Ganztägig</label>
      ${existing ? (draft.series ? `
        <div class="card">
          <p class="hint">↻ ${escape(patternSays(mine()))}${mine() ? ` · ${dayLabel(mine()!.from)} bis ${dayLabel(mine()!.until)}` : ""}</p>
          <div class="segmented">
            <button type="button" class="btn sm${reach === "one" ? " primary" : ""}" data-reach="one">Nur dieser</button>
            <button type="button" class="btn sm${reach === "from" ? " primary" : ""}" data-reach="from">Ab hier (${counts.from})</button>
            <button type="button" class="btn sm${reach === "all" ? " primary" : ""}" data-reach="all">Ganze Serie (${counts.all})</button>
          </div>
        </div>` : "") : `
        <div class="pair">
          <label><span class="lbl">Wiederholen</span><select class="field" name="repeat">
            <option value="none"${repeat === "none" ? " selected" : ""}>einmalig</option>
            <option value="daily"${repeat === "daily" ? " selected" : ""}>jeden Tag</option>
            <option value="weekly"${repeat === "weekly" ? " selected" : ""}>wöchentlich</option>
            <option value="yearly"${repeat === "yearly" ? " selected" : ""}>jedes Jahr</option>
          </select></label>
          ${repeat === "none" ? "" : `
            <label><span class="lbl">Endet</span><select class="field" name="endBy">
              <option value="until"${endBy === "until" ? " selected" : ""}>am Datum</option>
              <option value="times"${endBy === "times" ? " selected" : ""}>nach Anzahl</option>
            </select></label>
            ${endBy === "until"
              ? `<label><span class="lbl">Bis</span><input class="field" type="date" name="until" value="${iso(addDays(new Date(`${draft.date}T00:00`), 55))}" /></label>`
              : `<label><span class="lbl">Wie oft</span><input class="field" type="number" min="1" max="500" name="times" value="10" /></label>`}`}
        </div>
        ${repeat === "weekly" ? `<div class="chips">${weekdays.map((name, index) =>
          `<button type="button" class="chip${weekly.includes(index) ? " on" : ""}" data-weekday="${index}">${name}</button>`).join("")}</div>` : ""}`}

      <div class="segmented">
        <button type="button" class="btn sm${mode === "fixed" ? " primary" : ""}" data-mode="fixed">Feste Symbole</button>
        <button type="button" class="btn sm${mode === "choice" ? " primary" : ""}" data-mode="choice">Das Kind wählt</button>
      </div>
      ${mode === "fixed" ? `
        <div class="chips">${draft.symbols.map((symbol, index) =>
          `<button type="button" class="chip" data-drop-symbol="${index}">${tile(symbol, symbol.label, known)}${escape(symbol.label)} ✕</button>`).join("")
          || `<span class="empty">noch kein Symbol</span>`}</div>
        <div class="pair find">
          <label><span class="lbl">Symbol hinzufügen</span><input class="field" name="query" placeholder="z. B. Spielplatz" autocomplete="off" /></label>
          <label><span class="lbl">Quelle</span><select class="field" name="source">${PROVIDER_IDS.map(id =>
            `<option value="${id}"${source === id ? " selected" : ""}>${id === "metacom" ? "METACOM" : "ARASAAC"}</option>`).join("")}</select></label>
        </div>
        <div class="hits">${results.map((ref, index) => {
          const url = pictureFor(known, ref);
          return `<button type="button" class="hit" data-take="${index}" title="${escape(ref.label)}">${url ? `<img src="${url}" alt="" />` : `<span class="gap">${escape(ref.label)}</span>`}</button>`;
        }).join("")}</div>`
      : `
        <p class="hint">Was zur Wahl steht, sind Karten: laminierte Bilder mit NFC-Tag, die du hinlegst. Lege sie einmal an, dann bietest du sie überall an.</p>
        <div class="chips">${draft.options.map(id =>
          `<button type="button" class="chip" data-drop="${id}">${cardTile(id, known)}${escape(cards.get(id)?.name ?? "?")} ✕</button>`).join("")
          || `<span class="empty">noch keine Karte</span>`}</div>
        <div class="chips">${cardList.filter(card => !draft.options.includes(card.id)).map(card =>
          `<button type="button" class="chip" data-take-card="${card.id}">${cardTile(card.id, known)}${escape(card.name)}</button>`).join("")}
          <button type="button" class="btn sm" data-new-card>＋ Neue Karte</button></div>`}

      <span class="lbl">Personen</span>
      <div class="chips">${draft.people.map(id => {
        const person = personById(id);
        return `<button type="button" class="chip on" data-person-off="${id}">${face(person, "sm")}${escape(person?.name ?? "?")} ✕</button>`;
      }).join("") || `<span class="empty">niemand</span>`}</div>
      <div class="pair find">
        <label><span class="lbl">Person suchen</span><input class="field" name="findWho" value="${escape(findWho)}" placeholder="Name" autocomplete="off" /></label>
      </div>
      <div class="chips">${whoOffered.map(person =>
        `<button type="button" class="chip" data-person-on="${person.id}">${face(person, "sm")}${escape(person.name)}</button>`).join("")
        || `<span class="empty">niemand offen</span>`}</div>
      <label class="check"><input type="checkbox" name="showPeople"${draft.showPeople ? " checked" : ""} /> Am Board zeigen</label>
    </form>`;
    foot.replaceChildren(...[
      ...(existing ? [button("Löschen", "destructive", () => void erase())] : []),
      el("span", "spacer"),
      button("Abbrechen", "quiet", () => handle.close()),
      button("Sichern", "primary", () => void save()),
    ]);
  };

  const erase = async () => {
    read();
    if (draft.series && reach !== "one") {
      const many = reach === "from" ? counts.from : counts.all;
      const sure = await confirmDialog({
        title: "Serie löschen", body: `${count(many, "Termin", "Termine")} werden gelöscht. Das lässt sich nicht rückgängig machen.`,
        confirmLabel: `${count(many, "Termin", "Termine")} löschen`, cancelLabel: "Abbrechen", closeLabel: "Schließen", danger: true,
      });
      if (!sure) return;
      const gone = await dropSeries(draft.series, reach === "from" ? draft.date : undefined);
      handle.close(); await load(); note(`${count(gone, "Termin", "Termine")} gelöscht.`);
      return;
    }
    await remove(draft.id);
    handle.close(); await load(); note("Termin gelöscht.");
  };

  const save = async () => {
    read();
    if (!whole && minute(draft.end!) <= minute(draft.start!)) draft.end = clock(minute(draft.start!) + board.snap);
    if (mode === "fixed") draft.options = []; else { draft.symbols = []; draft.chosen = undefined; }
    if (existing && draft.series && reach !== "one") {
      const changed = await editSeries(draft.series, shape(), reach === "from" ? draft.date : undefined);
      handle.close(); await load(); note(`${count(changed, "Termin", "Termine")} geändert.`);
      return;
    }
    if (!existing) {
      const data = new FormData(panel.querySelector("form")!);
      /* A multi-day all-day appointment is a daily batch: one record per day, the
         same mechanism a weekly Kita uses, only shorter. */
      const spans = whole && spanTo > draft.date && repeat === "none";
      if (spans || repeat !== "none") {
        const pattern: Pattern = spans ? { kind: "daily" }
          : repeat === "weekly" ? { kind: "weekly", weekdays: weekly } : repeat === "yearly" ? { kind: "yearly" } : { kind: "daily" };
        const until = spans ? spanTo
          : endBy === "until" ? String(data.get("until") || draft.date) : boundFor(pattern, draft.date, Number(data.get("times") || 1));
        const stop = until < draft.date ? draft.date : until;
        const made = occurrences(pattern, draft.date, stop).length;
        await createSeries(pattern, draft.date, stop, shape());
        handle.close(); await load(); note(`${count(made, "Termin", "Termine")} angelegt.`);
        return;
      }
    }
    await put(draft);
    handle.close(); await load();
  };

  let typing = 0;
  panel.addEventListener("input", event => {
    const target = event.target as HTMLInputElement;
    read();
    if (["whole", "repeat", "endBy", "source", "findWho"].includes(target.name)) {
      void paint().then(() => {
        const again = panel.querySelector<HTMLInputElement>(`[name="${target.name}"]`);
        if (again && target.name === "findWho") { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      });
      return;
    }
    if (target.name !== "query") return;
    clearTimeout(typing);
    const query = target.value.trim();
    typing = window.setTimeout(async () => {
      results = query.length < 2 ? [] : (await search(source, query).catch(() => [])).slice(0, 18).map(candidate => refFor(source, candidate));
      await paint();
      const field = panel.querySelector<HTMLInputElement>('[name="query"]')!;
      field.value = query; field.focus();
    }, 250);
  });
  panel.addEventListener("click", async event => {
    const target = (event.target as HTMLElement).closest("[data-mode],[data-take],[data-drop-symbol],[data-take-card],[data-drop],[data-new-card],[data-person-on],[data-person-off],[data-weekday],[data-reach]") as HTMLElement | null;
    if (!target) return;
    read();
    if (target.dataset.mode) mode = target.dataset.mode as typeof mode;
    else if (target.dataset.reach) reach = target.dataset.reach as Reach;
    else if (target.dataset.weekday) {
      const day = Number(target.dataset.weekday);
      weekly = weekly.includes(day) ? weekly.filter(other => other !== day) : [...weekly, day];
      if (!weekly.length) weekly = [day];
    } else if (target.dataset.newCard !== undefined) {
      editCard({ id: uuid(), name: "", updatedAt: 0 }, id => { draft.options = [...draft.options, id]; void paint(); });
      return;
    } else if (target.dataset.take) {
      const ref = results[Number(target.dataset.take)];
      if (!draft.symbols.some(symbol => symbol.source === ref.source && symbol.id === ref.id)) draft.symbols = [...draft.symbols, ref];
    } else if (target.dataset.dropSymbol) {
      const index = Number(target.dataset.dropSymbol);
      draft.symbols = draft.symbols.filter((_, at) => at !== index);
    } else if (target.dataset.takeCard) {
      draft.options = [...draft.options, target.dataset.takeCard];
    } else if (target.dataset.drop) {
      draft.options = draft.options.filter(other => other !== target.dataset.drop);
    } else if (target.dataset.personOn) draft.people = [...draft.people, target.dataset.personOn];
    else if (target.dataset.personOff) draft.people = draft.people.filter(other => other !== target.dataset.personOff);
    await paint();
  });
  void paint();
}

/** A photo is shrunk before it is stored: these records go in a synced folder later. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height), size = 160;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.82);
}
function pickFile(accept: string, folder: boolean, take: (files: FileList) => void) {
  const input = document.createElement("input");
  input.type = "file";
  if (folder) input.setAttribute("webkitdirectory", "");
  else input.accept = accept;
  input.addEventListener("change", () => { if (input.files?.length) take(input.files); });
  input.click();
}

/* One settings panel is open at a time: `<details name="settings">` is the
   platform's own accordion, and the state belongs in the heading so the column
   reads as a list of answers. conventions.md §3.5. */
function settings() {
  const panel = el("div", "panels");
  const foot = el("div", "foot-actions");
  const handle = openDialog({ title: "Einstellungen", closeLabel: "Schließen", body: [panel], footer: [foot], wide: true });
  let busy = "";

  const run = async (work: () => Promise<unknown>, done: string) => {
    busy = "Einen Moment …"; paint();
    try { await work(); busy = done; }
    catch (error) { busy = `Das ging nicht: ${(error as Error)?.message ?? "unbekannter Fehler"}`; }
    [people, cardList] = await Promise.all([allPeople(), allCards()]);
    cards = new Map(cardList.map(item => [item.id, item]));
    urls = await pictures([...appointments.flatMap(item => item.symbols), ...cardList.map(item => item.symbol).filter(Boolean) as SymbolRef[]]);
    paint();
  };

  const paint = () => {
    const status = metacom.status();
    const open = panel.querySelector<HTMLDetailsElement>("details[open]")?.dataset.panel;
    panel.innerHTML = `
      <details class="panel" name="settings" data-panel="symbols"${open === "symbols" ? " open" : ""}>
        <summary><span class="section">Symbole</span><span class="state">${escape(says(status))}</span></summary>
        <div class="panel-body">
          <p class="hint">METACOM wird aus deinem eigenen lizenzierten Ordner gelesen. Nichts davon verlässt den Browser. ARASAAC braucht keine Einrichtung.</p>
          ${needsAttention(status) ? `<p class="notice bad">${escape(says(status))}</p>` : ""}
          ${busy ? `<p class="hint">${escape(busy)}</p>` : ""}
          <div class="chips">
            <button type="button" class="btn sm" data-pick>${supportsPicker ? "Ordner wählen" : "Ordner hochladen"}</button>
            <button type="button" class="btn sm quiet" data-zip>ZIP lesen</button>
            ${status.kind === "needs-setup" && status.code === "permission-needed" ? `<button type="button" class="btn sm" data-again>Erneut erlauben</button>` : ""}
            ${metacom.isReady() ? `<button type="button" class="btn sm quiet" data-reindex>Neu einlesen</button>
              <button type="button" class="btn sm destructive" data-forget>Ordner vergessen</button>` : ""}
          </div>
        </div>
      </details>
      <details class="panel" name="settings" data-panel="cards"${open === "cards" ? " open" : ""}>
        <summary><span class="section">Karten</span><span class="state">${count(cardList.length, "Karte", "Karten")}${cardList.some(card => !card.nfc) ? " · nicht alle mit NFC-Nummer" : ""}</span></summary>
        <div class="panel-body">
          <p class="hint">Karten sind das, was zur Wahl steht: ein laminiertes Bild mit NFC-Tag, das du hinlegst. Jede hat eine Ansage und eine Nummer, an der das Board sie erkennt. Gewöhnliche Termine brauchen keine.</p>
          <div class="rows">${cardList.map(card => `
            <div class="row-item">
              <span class="dot" style="--tone:${toneOf(card)}"></span>
              ${cardTile(card.id)}
              <span>${escape(card.name)}${card.speech ? `<i class="muted"> · „${escape(card.speech)}“</i>` : ""}</span>
              <span class="spacer"></span>
              <code class="nfc${card.nfc ? "" : " none"}">${escape(card.nfc ?? "keine Nummer")}</code>
              <button type="button" class="btn quiet sm" data-edit-card="${card.id}">Bearbeiten</button>
              <button type="button" class="btn destructive sm" data-drop-card="${card.id}">Entfernen</button>
            </div>`).join("") || `<p class="empty">noch keine</p>`}</div>
          <button type="button" class="btn sm" data-new-card>＋ Neue Karte</button>
        </div>
      </details>
      <details class="panel" name="settings" data-panel="people"${open === "people" ? " open" : ""}>
        <summary><span class="section">Personen</span><span class="state">${count(people.length, "Person", "Personen")}</span></summary>
        <div class="panel-body">
          <p class="hint">Ein Geburtstag ist keine eigene Terminart: er ist ein Datum an der Person, und die Termine dafür entstehen daraus — ein Jahrhundert im Voraus, mit Krone am Tag.</p>
          <div class="rows">${people.map(person => `
            <div class="row-item">
              ${face(person)}
              <span>${escape(person.name)}</span>
              <span class="spacer"></span>
              <label class="birthday"><span class="muted">Geburtstag</span>
                <input class="field sm" type="date" data-birthday="${person.id}" value="${person.birthday ?? ""}" /></label>
              <button type="button" class="btn quiet sm" data-photo="${person.id}">${person.photo ? "Foto ändern" : "Foto"}</button>
              ${person.photo ? `<button type="button" class="btn quiet sm" data-unphoto="${person.id}">Foto weg</button>` : ""}
              <button type="button" class="btn destructive sm" data-drop-person="${person.id}">Entfernen</button>
            </div>`).join("") || `<p class="empty">noch niemand</p>`}</div>
          <form class="pair">
            <label><span class="lbl">Neue Person</span><input class="field" name="name" placeholder="z. B. Oma" autocomplete="off" /></label>
            <button type="button" class="btn sm" data-add-person>Hinzufügen</button>
          </form>
        </div>
      </details>`;
    foot.replaceChildren(el("span", "spacer"), button("Fertig", "primary", () => { handle.close(); void load(); }));
  };

  panel.addEventListener("change", event => {
    const field = event.target as HTMLInputElement;
    if (!field.dataset.birthday) return;
    const person = personById(field.dataset.birthday);
    if (person) void run(() => setBirthday(person, field.value || undefined), field.value ? "Geburtstag eingetragen." : "Geburtstag entfernt.");
  });
  panel.addEventListener("click", async event => {
    const target = (event.target as HTMLElement).closest("[data-pick],[data-zip],[data-again],[data-reindex],[data-forget],[data-photo],[data-unphoto],[data-drop-person],[data-add-person],[data-new-card],[data-edit-card],[data-drop-card]") as HTMLElement | null;
    if (!target) return;
    if (target.dataset.pick !== undefined) {
      if (supportsPicker) return void run(() => connect(), "Ordner gelesen.");
      return pickFile("", true, files => void run(() => useFolderFiles(files), "Ordner gelesen."));
    }
    if (target.dataset.zip !== undefined) return pickFile(".zip,application/zip", false, files => void run(() => useZip(files[0]), "ZIP gelesen."));
    if (target.dataset.again !== undefined) return void run(() => reconnect(), "Erlaubnis wieder da.");
    if (target.dataset.reindex !== undefined) return void run(() => rebuild(), "Neu eingelesen.");
    if (target.dataset.forget !== undefined) return void run(() => forget(), "Ordner vergessen.");
    if (target.dataset.newCard !== undefined) return editCard({ id: uuid(), name: "", updatedAt: 0 }, () => paint());
    if (target.dataset.editCard) {
      const card = cards.get(target.dataset.editCard);
      if (card) editCard(card, () => paint());
      return;
    }
    if (target.dataset.dropCard) {
      const card = cards.get(target.dataset.dropCard);
      const sure = await confirmDialog({
        title: "Karte entfernen", body: `„${card?.name ?? "Diese Karte"}“ wird entfernt. Termine, die sie zur Wahl stellen, verlieren sie.`,
        confirmLabel: "Entfernen", cancelLabel: "Abbrechen", closeLabel: "Schließen", danger: true,
      });
      if (sure) await run(() => removeCard(target.dataset.dropCard!), "Karte entfernt.");
      return;
    }
    if (target.dataset.photo) {
      const id = target.dataset.photo;
      return pickFile("image/*", false, files => void run(async () => {
        const person = personById(id);
        if (person) await putPerson({ ...person, photo: await shrink(files[0]) });
      }, "Foto gesichert."));
    }
    if (target.dataset.unphoto) {
      const person = personById(target.dataset.unphoto);
      return void run(async () => { if (person) await putPerson({ ...person, photo: undefined }); }, "Foto entfernt.");
    }
    if (target.dataset.dropPerson) {
      const person = personById(target.dataset.dropPerson);
      const sure = await confirmDialog({
        title: "Person entfernen", body: `${person?.name ?? "Diese Person"} wird entfernt. Termine bleiben, verlieren aber diese Person.`,
        confirmLabel: "Entfernen", cancelLabel: "Abbrechen", closeLabel: "Schließen", danger: true,
      });
      if (sure) await run(() => removePerson(target.dataset.dropPerson!), "Person entfernt.");
      return;
    }
    if (target.dataset.addPerson !== undefined) {
      const field = panel.querySelector<HTMLInputElement>('[name="name"]')!;
      const name = field.value.trim();
      if (!name) return;
      const tones = ["#b8460f", "#1d5fb0", "#7b3fa0", "#0f6b62", "#a3630c", "#2d5c2a"];
      await run(() => putPerson({ id: uuid(), name, initials: name.slice(0, 2).toUpperCase(), tone: tones[people.length % tones.length] }), `${name} hinzugefügt.`);
    }
  });
  paint();
}

app.addEventListener("click", event => {
  const node = event.target as HTMLElement;
  const target = node.closest("[data-week],[data-edit],[data-settings],[data-new-whole]") as HTMLElement | null;
  if (target?.dataset.week !== undefined) {
    offset = target.dataset.week === "0" ? 0 : offset + Number(target.dataset.week);
    return void load();
  }
  if (target?.dataset.settings !== undefined) return settings();
  if (target?.dataset.edit) {
    const appointment = appointments.find(candidate => candidate.id === target.dataset.edit);
    if (appointment) edit(appointment, true);
    return;
  }
  if (target?.dataset.newWhole) return edit(blank(target.dataset.newWhole), false);
  /* Clicking empty column space plans at the quarter hour that was clicked. */
  const column = node.closest<HTMLElement>(".col");
  if (!column) return;
  const y = event instanceof MouseEvent ? event.offsetY : 0;
  const at = Math.round((gridFrom + (y / HOUR) * 60) / board.snap) * board.snap;
  edit(blank(column.dataset.day!, clock(Math.min(at, gridTo - board.snap))), false);
});
metacom.subscribe(() => { void load(); });

await seed(new Date());
await restore().catch(() => false);
await load();
