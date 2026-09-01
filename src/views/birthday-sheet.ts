import { openDialog } from "@lautstark/design/dialog";
import { button, el, spacer } from "../ui.js";
import { bornOn, type Appointment, type Person } from "../model.js";
import { couldSay } from "../announce.js";
import { playButton } from "./pieces.js";

/*
 * A birthday, and nothing to do to it.
 *
 * The appointment a birthday writes is a projection of a person: it carries that
 * person and nothing else — no title, no symbol, no time — and everything about
 * it is derived. Its name is the person's, its crown is the person's, the
 * sentence the board says is built from the person's own date, and the yearly
 * batch was written by `setBirthday` when that date was typed.
 *
 * So the full appointment editor offered a form of which no field was harmless.
 * Moving the day dropped it off the person's own date, which silently stops it
 * being a birthday at all: no name, no crown, nothing said. Unchecking Ganztägig
 * gave it a time, and a fact about the day that has a time is a fact the day
 * sentence never sees. Editing the repetition diverged the batch from the one the
 * person record still points at. Removing the person left an appointment that is
 * nothing whatever. None of the four failed loudly, and three of them looked like
 * ordinary edits.
 *
 * What is left is worth showing rather than hiding: what it is, what will be
 * said, and where the one editable fact actually lives.
 */
export function birthdaySheet(appointment: Appointment, born: Person[]): void {
  const names = born.map(person => person.name).join(" und ");
  const years = new Set(born.map(person => Number(appointment.date.slice(0, 4)) - Number(person.birthday!.slice(0, 4))));
  const said = couldSay("", { birthday: { names: born.map(person => person.name), age: years.size === 1 ? [...years][0] : undefined } });
  const why = el("p", { class: "hint", attrs: { role: "status" } });

  const handle = openDialog({
    title: `${names} Geburtstag`, closeLabel: "Schließen",
    body: [el("div", { class: "stack" },
      ...said.map(line => el("div", { class: "sentence" },
        playButton("Ansage anhören", () => line.text, words => { why.textContent = words; }),
        el("span", { class: "sentence__text", text: line.text }))),
      why,
      /* Said rather than linked: the person is edited in a panel inside the
         settings sheet, and a button here would have to open a sheet on top of a
         sheet to reach it. Naming the path costs a line and no scrim. */
      el("p", { class: "hint", text: "Jedes Jahr, solange das Geburtsdatum steht. Name und Datum ändern sich mit der Person — Einstellungen → Personen." })),
    ],
    footer: [spacer(), button("Schließen", "primary", () => handle.close())],
  });
}

/** The people this appointment is the birthday of, or none — which is most of them. */
export const birthdayOf = (appointment: Appointment, people: Person[]): Person[] =>
  appointment.start ? [] : appointment.people
    .map(id => people.find(person => person.id === id))
    .filter((person): person is Person => !!person && bornOn(person, appointment.date));
