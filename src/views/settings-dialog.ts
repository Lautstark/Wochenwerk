import { openDialog, confirmDialog } from "@lautstark/design/dialog";
import { menuOn } from "@lautstark/design/menu";
import { button, el, fill, spacer } from "../ui.js";
import { dayLabel, type Card, type Person } from "../model.js";
import { clearAll, clearAppointments, removeCard, removePerson, uuid } from "../db.js";
import { connect, forget, metacom, needsAttention, rebuild, reconnect, says, supportsPicker, useFolderFiles, useZip } from "../symbols.js";
import { load, shown } from "../store.js";
import { cardThumb, face, row } from "./pieces.js";
import { editCard } from "./card-dialog.js";
import { editPerson, pickFile } from "./person-dialog.js";

interface Panel { node: HTMLDetailsElement; state: HTMLElement; body: HTMLElement }

/* One panel open at a time, and the state in the heading so the column reads as a
   list of answers rather than a scroll through everything anybody has opened.
   `name=` is the platform's own accordion. conventions.md §3.5. */
function makePanel(label: string): Panel {
  const state = el("span", { class: "state" });
  const body = el("div", { class: "panel__body" });
  const node = el("details", { class: "panel", attrs: { name: "settings" } },
    el("summary", {}, el("span", { class: "section", text: label }), state), body);
  return { node, state, body };
}

export function openSettings(say: (line: string) => void) {
  const symbols = makePanel("Symbole");
  const cards = makePanel("Karten");
  const people = makePanel("Personen");
  const data = makePanel("Daten");

  const handle = openDialog({
    title: "Einstellungen", closeLabel: "Schließen", wide: true,
    body: [symbols.node, cards.node, people.node, data.node],
    footer: [spacer(), button("Fertig", "primary", () => handle.close())],
  });

  const run = async (work: () => Promise<unknown>, done: string) => {
    try { await work(); say(done); }
    catch (error) { say(`Das ging nicht: ${(error as Error)?.message ?? "unbekannter Fehler"}`); }
    await load();
    sync();
  };
  const actions = (build: (add: (label: string, run: () => void, opts?: { danger?: boolean }) => void) => void) => {
    const trigger = el("button", { class: "btn icon quiet", text: "⋯", attrs: { type: "button", "aria-label": "Mehr" } });
    menuOn(trigger, build);
    return trigger;
  };

  function sync() {
    const status = metacom.status();
    symbols.state.textContent = says(status);
    fill(symbols.body,
      el("p", { class: "small muted", text: "METACOM wird aus deinem eigenen Ordner gelesen. Nichts davon verlässt den Browser. ARASAAC braucht keine Einrichtung." }),
      needsAttention(status) ? el("p", { class: "notice bad", text: says(status) }) : null,
      el("div", { class: "acts" },
        button(supportsPicker ? "Ordner wählen" : "Ordner hochladen", "sm",
          () => supportsPicker ? void run(() => connect(), "Ordner gelesen.")
            : pickFile("", true, files => void run(() => useFolderFiles(files), "Ordner gelesen."))),
        button("ZIP lesen", "sm quiet", () => pickFile(".zip,application/zip", false, files => void run(() => useZip(files[0]), "ZIP gelesen."))),
        status.kind === "needs-setup" && status.code === "permission-needed"
          ? button("Erneut erlauben", "sm", () => void run(() => reconnect(), "Erlaubnis wieder da.")) : null,
        metacom.isReady() ? button("Neu einlesen", "sm quiet", () => void run(() => rebuild(), "Neu eingelesen.")) : null,
        metacom.isReady() ? button("Ordner vergessen", "sm destructive", () => void run(() => forget(), "Ordner vergessen.")) : null));

    const cardList = [...shown().cards.values()];
    cards.state.textContent = `${cardList.length} ${cardList.length === 1 ? "Karte" : "Karten"}`;
    fill(cards.body,
      el("p", { class: "small muted", text: "Karten sind das, was zur Wahl steht: ein Bild mit NFC-Tag, das du hinlegst." }),
      el("div", { class: "rows" }, ...cardList.map(card => row(cardThumb(card), card.name,
        card.nfc ? el("code", { class: "nfc", text: card.nfc }) : el("span", { class: "row__state small muted", text: "keine Nummer" }),
        actions(add => {
          add("Bearbeiten", () => editCard(card, async () => { await load(); sync(); }));
          add("Entfernen", () => void eraseCard(card), { danger: true });
        })))),
      cardList.length ? null : el("p", { class: "empty", text: "noch keine" }),
      button("＋ Neue Karte", "sm", () => editCard({ id: uuid(), name: "", updatedAt: 0 }, async () => { await load(); sync(); })));

    people.state.textContent = `${shown().people.length} ${shown().people.length === 1 ? "Person" : "Personen"}`;
    fill(people.body,
      el("div", { class: "rows" }, ...shown().people.map(person => row(face(person), person.name,
        person.birthday ? `Geburtstag ${dayLabel(person.birthday)}` : "kein Geburtstag",
        actions(add => {
          add("Bearbeiten", () => editPerson(person, async () => { await load(); sync(); }));
          add("Entfernen", () => void erasePerson(person), { danger: true });
        })))),
      shown().people.length ? null : el("p", { class: "empty", text: "noch niemand" }),
      button("＋ Neue Person", "sm", () => editPerson({ id: uuid(), name: "", initials: "", tone: "" }, async () => { await load(); sync(); })));

    data.state.textContent = `${shown().appointments.length} in dieser Woche`;
    fill(data.body,
      el("div", { class: "acts" },
        button("Alle Termine löschen", "sm destructive", () => void wipe(false)),
        button("Alle Daten löschen", "sm destructive", () => void wipe(true))));
  }

  const eraseCard = async (card: Card) => {
    if (await confirmDialog({ title: "Karte entfernen", body: `„${card.name}“ wird entfernt. Termine, die sie zur Wahl stellen, verlieren sie.`,
      confirmLabel: "Entfernen", cancelLabel: "Abbrechen", closeLabel: "Schließen", danger: true })) {
      await run(() => removeCard(card.id), "Karte entfernt.");
    }
  };
  const erasePerson = async (person: Person) => {
    if (await confirmDialog({ title: "Person entfernen", body: `${person.name} wird entfernt. Termine bleiben, verlieren aber diese Person.`,
      confirmLabel: "Entfernen", cancelLabel: "Abbrechen", closeLabel: "Schließen", danger: true })) {
      await run(() => removePerson(person.id), "Person entfernt.");
    }
  };
  const wipe = async (everything: boolean) => {
    if (await confirmDialog({
      title: everything ? "Alle Daten löschen" : "Alle Termine löschen",
      body: everything ? "Termine, Karten und Personen werden gelöscht. Danach ist Wochenwerk leer."
        : "Der ganze Kalender wird geleert. Karten und Personen bleiben.",
      confirmLabel: everything ? "Alles löschen" : "Termine löschen", cancelLabel: "Abbrechen", closeLabel: "Schließen", danger: true,
    })) {
      await run(() => everything ? clearAll() : clearAppointments().then(() => undefined), "Gelöscht.");
    }
  };
  sync();
}
