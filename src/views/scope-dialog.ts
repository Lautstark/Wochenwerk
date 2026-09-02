import { openDialog } from "@lautstark/design/dialog";
import { button, el, spacer } from "../ui.js";

export type Scope = "one" | "from" | "all";
/* What the batch in front of the person *is*, which is not what it is made of.
   A weekly Kita is a rule and its days are occurrences of it; a holiday is one
   thing that lasts, and its days are days. Both are the same records and the
   same batch — `runsOf` puts the second back together for the board — so the
   only place the difference has to show is here, in the words the question is
   asked in. „Alle Termine der Serie" about four days away from home asks a
   person to think of their holiday as a repetition. */
export type Kind = "series" | "stretch";

const WORDS = {
  series: { what: "Wiederkehrender Termin", one: "Nur diesen Termin",
    from: "Diesen und alle folgenden", all: "Alle Termine der Serie", unit: ["Termin", "Termine"] },
  stretch: { what: "Mehrtägiger Termin", one: "Nur diesen Tag",
    from: "Diesen und alle folgenden Tage", all: "Alle Tage des Zeitraums", unit: ["Tag", "Tage"] },
} as const;

/* Which of a series an action applies to is asked at the moment of consequence
   rather than chosen in advance: it is a question about what is about to happen,
   and asking it keeps three controls out of every appointment without a series. */
export function askScope(verb: "ändern" | "löschen", counts: { from: number; all: number },
  { kind = "series", note }: { kind?: Kind; note?: string } = {}): Promise<Scope | null> {
  return new Promise(resolve => {
    const words = WORDS[kind];
    /* The middle answer is offered only where it is a third answer. Standing on
       the first day of a batch it reaches everything, and standing on the last it
       reaches one — so it comes up as „Diesen und alle folgenden (3)" beside
       „Alle (3)", the same answer under two names and the same number on both.
       The first day is also where somebody almost always is, because it is where
       the bar starts and where the sheet is opened from. */
    const between = counts.from !== counts.all && counts.from > 1;
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
      commit.textContent = `${many} ${words.unit[many === 1 ? 0 : 1]} ${verb}`;
    };
    say();

    const cancel = button("Abbrechen", "quiet", () => handle.close());

    const handle = openDialog({
      title: `${words.what} ${verb}`, closeLabel: "Schließen",
      body: [el("div", { class: "stack" },
        choice("one", words.one),
        between ? choice("from", words.from, counts.from) : null,
        choice("all", words.all, counts.all),
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
