import { bornOn, type Appointment, type Person } from "../model.js";
import { couldSay } from "../announce.js";
import { openSheet } from "@lautstark/design/svelte/sheet";
import { CLOSE } from "../views/dialog.js";
import BirthdayBody from "./BirthdayBody.svelte";
import DoneFoot from "./DoneFoot.svelte";

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
 * What is left is worth showing rather than hiding: what it is, what will be
 * said, and where the one editable fact actually lives.
 */
export function birthdaySheet(appointment: Appointment, born: Person[]): void {
  const names = born.map(person => person.name).join(" und ");
  const years = new Set(born.map(person => Number(appointment.date.slice(0, 4)) - Number(person.birthday!.slice(0, 4))));
  const said = couldSay("", {
    birthday: { names: born.map(person => person.name), age: years.size === 1 ? [...years][0] : undefined },
    date: appointment.date,
  });
  openSheet({ title: `${names} Geburtstag`, closeLabel: CLOSE, state: { said }, body: BirthdayBody, foot: DoneFoot });
}

/** The people this appointment is the birthday of, or none — which is most of them. */
export const birthdayOf = (appointment: Appointment, people: Person[]): Person[] =>
  appointment.start ? [] : appointment.people
    .map(id => people.find(person => person.id === id))
    .filter((person): person is Person => !!person && bornOn(person, appointment.date));
