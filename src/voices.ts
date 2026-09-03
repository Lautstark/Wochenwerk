import { azureVoices, labelOf, listVoices, type Offered } from "@lautstark/stimmquelle";
import { settings } from "./db.js";
import type { Settings } from "./model.js";

/* Which voices there are is stimmquelle's question, not this calendar's. The
   package knows which piper models may be handed on at all, which of them speak
   in a browser, and what Azure is offering today; a catalogue written here would
   be a second answer to all three, and the licensing one fails silently. See its
   README and ADR 002 — the same argument as bildquelle for symbols.

   What is left here is the German, because the package answers in codes so that a
   host is not handed words it cannot translate. */
export type Voice = Offered;

/**
 * Every voice this household could speak with, in one call.
 *
 * `lang: "de"` because the calendar is German and nobody is going to want a
 * language chip; `system: true` because the operating system's own voices cost
 * nothing and are the only German female ones on most machines. Azure appears
 * only when a key is in the settings record — and a key that does not work
 * throws rather than quietly returning a picker short of half its voices, which
 * is why the caller has to catch this and say so.
 *
 * `id` is exactly what speech is later asked for, so what gets stored is the id
 * and nothing has to be translated.
 *
 * **`ownsInference` is claimed, and it is what puts a German female piper voice
 * in the list.** stimmquelle's `browser` column is an answer about
 * `@diffusionstudio/vits-web` and nothing else, so a product that drives piper
 * itself is not subject to it; `de_DE-kerstin-low` is CC0 and shippable and was
 * kept out by that column alone. The flag is a claim about what this product
 * drives rather than a preference, and it became true in the change that wired
 * playback: `src/speech.ts` calls `usePiperRuntime`. It must not outlive that
 * call — without it the claim makes her selectable here and silent at synthesis,
 * which is the failure the flag exists to prevent.
 */
/* Azure's catalogue, asked once per key and region. It is the only part of this
   list that costs a request — piper's is a file in the package and the system's
   is the browser answering about itself — and Azure's answer does not change
   between two openings of the settings. The promise is held rather than the
   list, so asks that race share one request; a failure drops itself once it has
   settled, so asking again really asks. A new key is a new stamp, which is what
   makes saving or forgetting one refresh this without anybody clearing it. */
let asked: { stamp: string; catalogue: Promise<readonly Voice[]> } | null = null;
function azureCatalogue(azure: NonNullable<Settings["azure"]>): Promise<readonly Voice[]> {
  const stamp = `${azure.region}\u0000${azure.key}`;
  if (asked?.stamp !== stamp) {
    const catalogue = azureVoices({ ...azure, languages: ["de-DE"] });
    catalogue.catch(() => { if (asked?.catalogue === catalogue) asked = null; });
    asked = { stamp, catalogue };
  }
  return asked.catalogue;
}

export async function offered(withKey = true): Promise<Voice[]> {
  const { azure } = await settings();
  /* Asked without the key, so this half reaches no host at all and stays fresh:
     the browser can answer `getVoices()` with nothing on a first call and with
     the real list a moment later, and a cached empty one would outlive that. */
  const here = await listVoices({ lang: "de", system: true, ownsInference: true });
  if (!(withKey && azure)) return [...here];
  /* `listVoices` own order, kept so the picker does not reshuffle when a key is
     added: piper first, then Azure, then whatever the device has. */
  return [...here.filter(voice => voice.source === "piper"), ...await azureCatalogue(azure), ...here.filter(voice => voice.source !== "piper")];
}

/* Who renders it, whose voice it is and what it costs used to be four little
   translators here — `sourceOf`, `genderOf`, `weighs` and the `factsOf` that
   joined them. They are `@lautstark/stimmquelle/voice-picker`'s `factsOf` now,
   in the same words and with the same rule about which cost a row states, so
   there is one answer to "what does a row say about a voice" in the family
   rather than three that had drifted. The picker also matches the search against
   exactly that line, which is why keeping a second copy here would be a way for
   the list to answer to something it is not showing. */

/**
 * What has to be said out loud about a voice rather than implied — and only what
 * is this product's to weigh.
 *
 * The board is a wall device. „Braucht Netz" is not a slow start there, it is
 * silence — and `offline` is per voice rather than per source: Chrome lists its
 * Google voices beside the ones on the machine and they are synthesised on
 * Google's servers. Levelling is the other half: a system voice never goes
 * through the loudness chain, so it will not match the ones beside it, and that
 * is invisible until two appointments in a row are read out. Both facts mean
 * something else in a browser tab at a desk, which is why the picker asks rather
 * than says: this is its `notes()` hook.
 *
 * `rushesFragments` is gone from here, and only from here. The picker says that
 * one itself, in every product and in both languages — and it says it better,
 * because it prints the punctuation mark („Hallo!") instead of describing it.
 * Saying it twice would put the same sentence on the row twice.
 */
export function caveats(voice: Voice): string[] {
  const said: string[] = [];
  if (!voice.makesFile) said.push("Wird nicht angeglichen — sie ist lauter oder leiser als die anderen.");
  if (!voice.offline) said.push("Spricht über das Netz. Hat das Board keins, bleibt sie stumm.");
  return said;
}

/* What to call a voice, asked of the list it is being shown in rather than of the
   voice alone. Two of the German piper voices are both named „Thorsten" and differ
   only in tier, and this calendar used to tell them apart by download size alone —
   63 MB against 114. `labelOf` is stimmquelle's answer, and it is asked per list
   because the fold changes which list somebody is looking at: a label fixed against
   a list nobody is reading moves the ambiguity instead of removing it. */
export { labelOf };
export const nameOf = (voices: readonly Voice[], id: string | undefined) => {
  const voice = voices.find(item => item.id === id);
  return voice ? labelOf(voice, voices) : "";
};
