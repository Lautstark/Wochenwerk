import { openSheet } from "./sheet.svelte.js";
import ScopeBody from "./ScopeBody.svelte";
import ScopeFoot from "./ScopeFoot.svelte";

export type Scope = "one" | "from" | "all";
/* What the batch in front of the person *is*, which is not what it is made of.
   A weekly Kita is a rule and its days are occurrences of it; a stretch of days
   away is one thing that lasts, and its days are days. Both are the same records
   and the same batch — `runsOf` puts the second back together for the board — so
   the only place the difference has to show is here, in the words the question
   is asked in. „Alle Termine der Serie" about four days at somebody's
   grandmother asks a person to think of those days as a repetition. */
export type Kind = "series" | "stretch";

export const WORDS = {
  series: { what: "Wiederkehrender Termin", one: "Nur diesen Termin",
    from: "Diesen und alle folgenden", all: "Alle Termine der Serie", unit: ["Termin", "Termine"] },
  stretch: { what: "Mehrtägiger Termin", one: "Nur diesen Tag",
    from: "Diesen und alle folgenden Tage", all: "Alle Tage des Zeitraums", unit: ["Tag", "Tage"] },
} as const;

export interface ScopeState {
  verb: "ändern" | "löschen"; kind: Kind; counts: { from: number; all: number }; note?: string;
  picked: Scope; answer: (scope: Scope | null) => void;
}

/* Which of a series an action applies to is asked at the moment of consequence
   rather than chosen in advance: it is a question about what is about to happen,
   and asking it keeps three controls out of every appointment without a series. */
export function askScope(verb: "ändern" | "löschen", counts: { from: number; all: number },
  { kind = "series", note }: { kind?: Kind; note?: string } = {}): Promise<Scope | null> {
  return new Promise(resolve => {
    let settled = false;
    const s: ScopeState = $state({
      verb, kind, counts, note, picked: "one",
      answer: (scope: Scope | null) => { if (!settled) { settled = true; resolve(scope); } },
    });
    openSheet({ title: `${WORDS[kind].what} ${verb}`, state: s, body: ScopeBody, foot: ScopeFoot, onClose: () => s.answer(null) });
  });
}
