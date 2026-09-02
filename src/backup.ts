import { Sicherung } from "@lautstark/sicherung";
import { exportAll, onChanged } from "./db.js";

/**
 * The Sicherung that keeps itself: a folder chosen once, written to from then
 * on without anybody remembering to.
 *
 * Wochenwerk was the last product in the family without one, and the only one
 * that could not afford to be. The other three keep their work in IndexedDB and
 * treat a folder as a copy downstream of it; wochenwerk's Ablage *is* the store
 * (ADR 002), which means a mistake — a week deleted, a series repatterned across
 * the wrong days — is carried to every machine in the household within seconds
 * and there was nothing behind it to go back to. An Ablage answers "what if the
 * laptop dies". Only a dated copy answers "what if we did that on purpose and
 * were wrong". The settings panel has argued for this in as many words for as
 * long as it has existed, while offering a download somebody had to remember.
 *
 * What goes in is `exportAll()` and nothing else. That matters here the way it
 * matters in bildhaft: a chosen folder may well sit inside Dropbox, so what is
 * written leaves the machine — and the export carries symbol *references*, never
 * a METACOM byte or filename. The licence is per household, and the folder is
 * somewhere else.
 */
export const backup = new Sicherung({
  app: "wochenwerk",
  produce: exportAll,
  /* Nothing in this calendar. The package holds a write that would put an empty
     export over a folder holding the real thing, and this is what tells it —
     it knows nothing of appointments and would have to be told their name to
     guess. The case is not hypothetical: both routes are separate origins'
     storage away from each other, and bildhaft lost three collections to exactly
     this when its site moved to a subdomain and the new address opened empty.
     Cards and people are not counted. They outlive any particular week and a
     household that has planned nothing yet still has both. */
  looksEmpty: (produced) => (produced as { termine?: unknown[] }).termine?.length === 0,
});

/* Debounced by the package, so this is every write and not every keystroke. The
   two funnels in db.ts are what call `touched`, which is why this line does not
   have to know which of them ran. */
onChanged(() => backup.schedule());
