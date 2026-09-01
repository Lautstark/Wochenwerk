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
    const choice = (value: Scope, label: string, many?: number) =>
      el("label", { class: "choice" },
        el("input", { attrs: { type: "radio", name: "scope", value, ...(value === "one" ? { checked: true } : {}) },
          on: { change: () => { picked = value; } } }),
        el("span", { text: label }),
        many === undefined ? null : el("span", { class: "small muted", text: `(${many})` }));

    const handle = openDialog({
      title: `Wiederkehrender Termin ${verb}`, closeLabel: "Schließen",
      body: [el("div", { class: "stack" },
        choice("one", "Nur diesen Termin"),
        choice("from", "Diesen und alle folgenden", counts.from),
        choice("all", "Alle Termine der Serie", counts.all),
        note ? el("p", { class: "small muted", text: note }) : null)],
      footer: [spacer(),
        button("Abbrechen", "quiet", () => handle.close()),
        button(verb === "löschen" ? "Löschen" : "Sichern", verb === "löschen" ? "destructive filled" : "primary",
          () => { answer(picked); handle.close(); })],
      onClose: () => answer(null),
    });
  });
}
