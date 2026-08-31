import "./kalender.css";
import { addDays, board, clock, dayLabel, iso, minute, mondayOf, shownSymbols, snapped, undecided, weekdays,
  type Appointment, type Person, type Source, type Special, type SymbolRef } from "./model.js";
import { allPeople, allSpecials, put, putPerson, putSpecial, remove, removeSpecial, seed, uuid, week } from "./db.js";
import { connect, metacom, pictureFor, pictures, reconnect, refFor, restore, says, search, supported } from "./symbols.js";

/* The calendar is where appointments are kept. It writes the records the board
   reads; it knows nothing about how the board draws them. */

const app = document.querySelector<HTMLElement>("#app")!;
let offset = 0;
let people: Person[] = [], specials: Special[] = [], appointments: Appointment[] = [];
let urls = new Map<string, string>();

const monday = () => addDays(mondayOf(new Date()), offset * 7);
const dates = () => Array.from({ length: 7 }, (_, index) => iso(addDays(monday(), index)));
const escape = (text: string) => text.replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
const byStart = (a: Appointment, b: Appointment) => snapped(a.start) - snapped(b.start);
const personById = (id: string) => people.find(person => person.id === id);

function symbolTile(ref: SymbolRef, size = "") {
  const url = pictureFor(urls, ref);
  const inner = url ? `<img src="${url}" alt="" />` : `<span class="gap">${escape(ref.label)}</span>`;
  return `<span class="tile ${size}" title="${escape(ref.label)}">${inner}</span>`;
}

function row(appointment: Appointment) {
  const symbols = shownSymbols(appointment).map(ref => symbolTile(ref)).join("");
  const crowd = appointment.people.map(id => personById(id)).filter(Boolean)
    .map(person => `<span class="who" style="--tone:${person!.tone}">${escape(person!.initials)}</span>`).join("");
  return `<button class="entry${undecided(appointment) ? " open" : ""}" data-edit="${appointment.id}">
    <span class="when">${appointment.start}<i>–${appointment.end}</i></span>
    <span class="what">${symbols}</span>
    <span class="whom">${crowd}</span>
  </button>`;
}

function render() {
  const today = iso(new Date());
  const days = dates().map((date, index) => {
    const mine = appointments.filter(appointment => appointment.date === date).sort(byStart);
    const marks = specials.filter(special => special.from <= date && date <= special.to)
      .map(special => { const person = personById(special.person); return person ? `<span class="who" style="--tone:${person.tone}">${special.kind === "birthday" ? "★" : ""}${escape(person.initials)}</span>` : ""; }).join("");
    return `<section class="col${date === today ? " today" : ""}">
      <header><b>${weekdays[index]}</b><time>${dayLabel(date)}</time><span class="marks">${marks}</span></header>
      <div class="entries">${mine.map(row).join("") || `<p class="empty">nichts geplant</p>`}</div>
      <button class="btn quiet sm add" data-add="${date}">+ Termin</button>
    </section>`;
  }).join("");
  const attention = metacom.isReady() ? "" : `<p class="notice bad">${escape(says(metacom.status()))}</p>`;
  app.innerHTML = `
    <div class="shell">
      <header class="top">
        <div class="nav">
          <button class="btn quiet sm" data-week="-1">‹</button>
          <b>${dayLabel(iso(monday()))} – ${dayLabel(iso(addDays(monday(), 6)))}</b>
          <button class="btn quiet sm" data-week="1">›</button>
          <button class="btn quiet sm" data-week="0">Diese Woche</button>
        </div>
        <div class="nav">
          <a class="btn quiet sm" href="/">Symbolansicht</a>
          <button class="btn sm" data-settings>Einstellungen</button>
        </div>
      </header>
      ${attention}
      <div class="week">${days}</div>
    </div>`;
}

async function load() {
  [appointments, people, specials] = await Promise.all([week(monday()), allPeople(), allSpecials()]);
  urls = await pictures(appointments.flatMap(appointment => [...appointment.symbols, ...appointment.options]));
  render();
}

/* Dialogs are native `<dialog>` with `showModal()`, the way the family builds them. */
function ask(inner: string, wire: (dialog: HTMLDialogElement) => void) {
  const dialog = document.createElement("dialog");
  dialog.innerHTML = inner;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  wire(dialog);
  dialog.showModal();
  return dialog;
}

const blank = (date: string): Appointment =>
  ({ id: uuid(), date, start: "09:00", end: "09:30", symbols: [], options: [], people: [], showPeople: false, updatedAt: 0 });

function edit(appointment: Appointment, existing: boolean) {
  let draft: Appointment = structuredClone(appointment);
  let mode: "fixed" | "choice" = draft.options.length ? "choice" : "fixed";
  let source: Source = "metacom";
  let results: SymbolRef[] = [];

  const dialog = ask(`<form method="dialog" class="sheet"></form>`, () => undefined);
  const form = dialog.querySelector("form")!;

  const paint = async () => {
    const chosen = mode === "choice" ? draft.options : draft.symbols;
    const known = await pictures([...chosen, ...results]);
    const picked = chosen.map((ref, index) =>
      `<button type="button" class="chip" data-drop="${index}">${(() => { const url = pictureFor(known, ref); return url ? `<img src="${url}" alt="" />` : ""; })()}${escape(ref.label)} ✕</button>`).join("");
    const found = results.map((ref, index) => {
      const url = pictureFor(known, ref);
      return `<button type="button" class="hit" data-take="${index}" title="${escape(ref.label)}">${url ? `<img src="${url}" alt="" />` : `<span class="gap">${escape(ref.label)}</span>`}</button>`;
    }).join("");
    form.innerHTML = `
      <h2>${existing ? "Termin" : "Neuer Termin"}</h2>
      <div class="pair">
        <label><span class="lbl">Tag</span><input class="field" type="date" name="date" value="${draft.date}" /></label>
        <label><span class="lbl">Von</span><input class="field" type="time" step="${board.snap * 60}" name="start" value="${draft.start}" /></label>
        <label><span class="lbl">Bis</span><input class="field" type="time" step="${board.snap * 60}" name="end" value="${draft.end}" /></label>
      </div>
      <div class="segmented">
        <button type="button" class="btn sm${mode === "fixed" ? " primary" : ""}" data-mode="fixed">Festes Symbol</button>
        <button type="button" class="btn sm${mode === "choice" ? " primary" : ""}" data-mode="choice">Zur Auswahl</button>
      </div>
      <p class="hint">${mode === "choice" ? "Das Kind wählt eins davon – am Board oder mit einer Karte." : "Das Symbol steht fest."}</p>
      <div class="chips">${picked || `<span class="empty">noch keins</span>`}</div>
      <div class="pair find">
        <label><span class="lbl">Symbol suchen</span><input class="field" name="query" placeholder="z. B. Spielplatz" /></label>
        <label><span class="lbl">Quelle</span><select class="field" name="source">
          <option value="metacom"${source === "metacom" ? " selected" : ""}>METACOM (dein Ordner)</option>
          <option value="arasaac"${source === "arasaac" ? " selected" : ""}>ARASAAC</option>
        </select></label>
      </div>
      <div class="hits">${found}</div>
      <div class="who-pick">
        <span class="lbl">Personen</span>
        <div class="chips">${people.map(person =>
          `<button type="button" class="chip${draft.people.includes(person.id) ? " on" : ""}" data-person="${person.id}"><i style="--tone:${person.tone}"></i>${escape(person.name)}</button>`).join("")}</div>
        <label class="check"><input type="checkbox" name="showPeople"${draft.showPeople ? " checked" : ""} /> Avatare am Board zeigen</label>
      </div>
      <footer>
        ${existing ? `<button type="button" class="btn destructive" data-delete>Löschen</button>` : ""}
        <span class="spacer"></span>
        <button type="button" class="btn quiet" data-cancel>Abbrechen</button>
        <button type="button" class="btn primary" data-save>Sichern</button>
      </footer>`;
  };

  const read = () => {
    const data = new FormData(form);
    draft.date = String(data.get("date") || draft.date);
    draft.start = String(data.get("start") || draft.start);
    draft.end = String(data.get("end") || draft.end);
    draft.showPeople = data.get("showPeople") === "on";
    source = (String(data.get("source")) as Source) || source;
  };

  let typing = 0;
  form.addEventListener("input", event => {
    const target = event.target as HTMLElement;
    if ((target as HTMLInputElement).name !== "query") { read(); return; }
    read();
    clearTimeout(typing);
    const query = (target as HTMLInputElement).value.trim();
    typing = window.setTimeout(async () => {
      results = query.length < 2 ? [] : (await search(source, query).catch(() => []))
        .slice(0, 12).map(candidate => refFor(source, candidate));
      const keep = query;
      await paint();
      const field = form.querySelector<HTMLInputElement>('[name="query"]')!;
      field.value = keep;
      field.focus();
    }, 250);
  });

  form.addEventListener("click", async event => {
    const target = (event.target as HTMLElement).closest("[data-mode],[data-take],[data-drop],[data-person],[data-save],[data-cancel],[data-delete]") as HTMLElement | null;
    if (!target) return;
    read();
    if (target.dataset.mode) { mode = target.dataset.mode as typeof mode; await paint(); return; }
    if (target.dataset.take) {
      const ref = results[Number(target.dataset.take)];
      if (mode === "choice") draft.options = [...draft.options, ref]; else draft.symbols = [...draft.symbols, ref];
      await paint(); return;
    }
    if (target.dataset.drop) {
      const index = Number(target.dataset.drop);
      if (mode === "choice") draft.options = draft.options.filter((_, at) => at !== index);
      else draft.symbols = draft.symbols.filter((_, at) => at !== index);
      await paint(); return;
    }
    if (target.dataset.person) {
      const id = target.dataset.person;
      draft.people = draft.people.includes(id) ? draft.people.filter(other => other !== id) : [...draft.people, id];
      await paint(); return;
    }
    if (target.dataset.cancel !== undefined) { dialog.close(); return; }
    if (target.dataset.delete !== undefined) { await remove(draft.id); dialog.close(); await load(); return; }
    if (target.dataset.save !== undefined) {
      if (minute(draft.end) <= minute(draft.start)) draft.end = clock(minute(draft.start) + board.snap);
      if (mode === "fixed") draft.options = []; else { draft.symbols = []; draft.chosen = undefined; }
      await put(draft);
      dialog.close();
      await load();
    }
  });

  void paint();
}

function settings() {
  const dialog = ask(`<form method="dialog" class="sheet"></form>`, () => undefined);
  const form = dialog.querySelector("form")!;
  const paint = () => {
    const folder = supported()
      ? `<p class="notice${metacom.isReady() ? "" : " bad"}">${escape(says(metacom.status()))}</p>
         <div class="segmented">
           <button type="button" class="btn sm" data-connect>Ordner verbinden</button>
           <button type="button" class="btn sm quiet" data-reconnect>Erneut erlauben</button>
         </div>`
      : `<p class="notice bad">Dieser Browser kann keinen Ordner öffnen. METACOM braucht Chromium auf dem Rechner.</p>`;
    form.innerHTML = `
      <h2>Einstellungen</h2>
      <span class="lbl">METACOM</span>
      ${folder}
      <span class="lbl">Personen</span>
      <div class="chips">${people.map(person => `<span class="chip"><i style="--tone:${person.tone}"></i>${escape(person.name)}</span>`).join("") || `<span class="empty">noch keine</span>`}</div>
      <div class="pair">
        <label><span class="lbl">Name</span><input class="field" name="name" placeholder="z. B. Oma" /></label>
        <button type="button" class="btn sm" data-add-person>Hinzufügen</button>
      </div>
      <span class="lbl">Besuch und Geburtstag</span>
      <div class="chips">${specials.map(special => { const person = personById(special.person); return `<button type="button" class="chip" data-drop-special="${special.id}">${special.kind === "birthday" ? "★ " : ""}${escape(person?.name ?? "?")} ${dayLabel(special.from)}–${dayLabel(special.to)} ✕</button>`; }).join("") || `<span class="empty">nichts eingetragen</span>`}</div>
      <div class="pair">
        <label><span class="lbl">Wer</span><select class="field" name="person">${people.map(person => `<option value="${person.id}">${escape(person.name)}</option>`).join("")}</select></label>
        <label><span class="lbl">Was</span><select class="field" name="kind"><option value="visit">Besuch</option><option value="birthday">Geburtstag</option></select></label>
        <label><span class="lbl">Von</span><input class="field" type="date" name="from" value="${iso(new Date())}" /></label>
        <label><span class="lbl">Bis</span><input class="field" type="date" name="to" value="${iso(new Date())}" /></label>
        <button type="button" class="btn sm" data-add-special>Eintragen</button>
      </div>
      <footer><span class="spacer"></span><button type="button" class="btn primary" data-close>Fertig</button></footer>`;
  };
  form.addEventListener("click", async event => {
    const target = (event.target as HTMLElement).closest("[data-connect],[data-reconnect],[data-add-person],[data-add-special],[data-drop-special],[data-close]") as HTMLElement | null;
    if (!target) return;
    const data = new FormData(form);
    if (target.dataset.connect !== undefined) { await connect().catch(() => undefined); paint(); return; }
    if (target.dataset.reconnect !== undefined) { await reconnect().catch(() => false); paint(); return; }
    if (target.dataset.addPerson !== undefined) {
      const name = String(data.get("name") || "").trim();
      if (!name) return;
      const tones = ["#b8460f", "#1d5fb0", "#7b3fa0", "#0f6b62", "#a3630c", "#2d5c2a"];
      await putPerson({ id: uuid(), name, initials: name.slice(0, 2).toUpperCase(), tone: tones[people.length % tones.length] });
      people = await allPeople(); paint(); return;
    }
    if (target.dataset.addSpecial !== undefined) {
      const person = String(data.get("person") || "");
      if (!person) return;
      await putSpecial({ id: uuid(), kind: String(data.get("kind")) as Special["kind"], person, from: String(data.get("from")), to: String(data.get("to")) });
      specials = await allSpecials(); paint(); return;
    }
    if (target.dataset.dropSpecial) { await removeSpecial(target.dataset.dropSpecial); specials = await allSpecials(); paint(); return; }
    if (target.dataset.close !== undefined) { dialog.close(); await load(); }
  });
  paint();
}

app.addEventListener("click", event => {
  const target = (event.target as HTMLElement).closest("[data-week],[data-add],[data-edit],[data-settings]") as HTMLElement | null;
  if (!target) return;
  if (target.dataset.week !== undefined) {
    offset = target.dataset.week === "0" ? 0 : offset + Number(target.dataset.week);
    void load(); return;
  }
  if (target.dataset.add) { edit(blank(target.dataset.add), false); return; }
  if (target.dataset.edit) {
    const appointment = appointments.find(candidate => candidate.id === target.dataset.edit);
    if (appointment) edit(appointment, true);
    return;
  }
  if (target.dataset.settings !== undefined) settings();
});
metacom.subscribe(() => { void load(); });

await seed(new Date());
await restore().catch(() => false);
await load();
