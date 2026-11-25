import { onSyncing } from "./db.js";

/* Whether the week on screen is still the mirror being checked against the
   folder. `db.ts` says so from the one place a sync happens; this holds it as a
   rune so that whatever reads it while drawing is redrawn when it changes, the
   way `store.svelte.ts` holds the week. See ADR 004.

   True from the start, and not only while `db.ts` says so: the boot draws the
   mirror and then spends a moment reaching for METACOM and the folder before the
   sync itself begins. A sheet opened in that moment would plan against a week
   nobody has checked yet, so the page is unconfirmed until the boot says it is
   done. Where no folder is connected that is a few milliseconds. */
let busy = $state.raw(false);
let booting = $state.raw(true);
onSyncing(now => { busy = now; });

export const syncing = (): boolean => busy || booting;
/** The boot has had the folder's answer, or found there is no folder to ask. */
export const booted = () => { booting = false; };
