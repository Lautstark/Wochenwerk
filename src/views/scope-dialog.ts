import { openDialog } from "@lautstark/design/dialog";
import { button, el, spacer } from "../ui.js";

export type Scope = "one" | "from" | "all";

/* Which of a series an action applies to is asked at the moment of consequence
   rather than chosen in advance: it is a question about what is about to happen,
   and asking it keeps three controls out of every appointment without a series. */
export function askScope(verb: "ändern" | "löschen", counts: { from: number; all: number }, note?: string): Promise<Scope | null> {
  return new Promise(resolve => {
    let picked: Scope = "one";
    let settled = false;
    const answer = (scope: Scope | null) => { if (!settled) { settled = true; resolve(scope); } };
    /* How many the answer standing there would take. „Nur diesen" is one by
       definition; the other two are counted before the sheet opens. */
    const reach = (scope: Scope) => scope === "one" ? 1 : scope === "from" ? counts.from : counts.all;

    const choice = (value: Scope, label: string, many?: number) =>
      el("label", { class: "choice" },
        el("input", { attrs: { type: "radio", name: "scope", value, ...(value === "one" ? { checked: true } : {}) },
          on: { change: () => { picked = value; say(); } } }),
        el("span", { text: label }),
        many === undefined ? null : el("span", { class: "small muted", text: `(${many})` }));

    /* Labelled with the act and with the number, and it follows the radios:
       conventions.md §1.7 — a button reading "OK" asks the reader to hold what it
       refers to in their head, and the count is the one fact in the question that
       could change a mind. Three radios and one unchanging „Löschen" put that
       number everywhere except on the control that spends it. */
    const commit = button("", verb === "löschen" ? "destructive filled" : "primary",
      () => { answer(picked); handle.close(); });
    const say = () => {
      const many = reach(picked);
      commit.textContent = `${many} ${many === 1 ? "Termin" : "Termine"} ${verb}`;
    };
    say();

    const cancel = button("Abbrechen", "quiet", () => handle.close());

    const handle = openDialog({
      title: `Wiederkehrender Termin ${verb}`, closeLabel: "Schließen",
      body: [el("div", { class: "stack" },
        choice("one", "Nur diesen Termin"),
        choice("from", "Diesen und alle folgenden", counts.from),
        choice("all", "Alle Termine der Serie", counts.all),
        note ? el("p", { class: "small muted", text: note }) : null)],
      footer: [spacer(), cancel, commit],
      onClose: () => answer(null),
    });

    /* Focus starts on the way out. `showModal()` would otherwise leave it on the
       first focusable thing in the sheet, and for a question whose other button
       deletes a year of Tuesdays the safe action is the one to be standing on.
       conventions.md §3.4 — `confirmDialog` in the package does exactly this, and
       this sheet is the family's other destructive question. */
    cancel.focus();
  });
}
