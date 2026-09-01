import { listVoices, type Offered } from "@lautstark/stimmquelle";
import { settings } from "./db.js";

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
 * **`ownsInference` is not claimed here, and that is why there is no German female
 * piper voice in the list.** stimmquelle's `browser` column is an answer about
 * `@diffusionstudio/vits-web` and nothing else, so a product that drives piper
 * itself is not subject to it; `de_DE-kerstin-low` is CC0 and shippable and is
 * kept out by that column alone. The flag is a claim about what this product
 * drives, not a preference — wochenwerk does not call `usePiperRuntime` yet, and
 * claiming it would make her selectable here and fail at synthesis, which is the
 * failure the flag exists to prevent. Whoever wires playback sets it in the same
 * change that calls `usePiperRuntime`, and not before. mitreden and vorlaut both
 * claim it, which is why she is offered there.
 */
export async function offered(withKey = true): Promise<Voice[]> {
  const { azure } = await settings();
  return [...await listVoices({ lang: "de", system: true, ...(withKey && azure ? { azure } : {}) })];
}

/** Who renders it: what somebody choosing is actually deciding between. */
export const sourceOf = (source: Voice["source"]) =>
  source === "azure" ? "Azure" : source === "system" ? "Vom Gerät" : "Mitgeliefert";

/* stimmquelle publishes three, and a corpus of several speakers is `mixed` rather
   than a guess. A system voice has none at all — the Web Speech API publishes a
   name and a language and nothing else, and guessing from the name is how somebody
   gets told their voice is a woman because it is called Anna. */
export const genderOf = (gender: string) =>
  gender === "female" ? "weiblich" : gender === "male" ? "männlich" : gender === "mixed" ? "gemischt" : gender;

/** `63_201_294` → `63 MB`. Whole megabytes: it is a number somebody glances at. */
export const weighs = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

/** What decides between two voices, in one line and with no verdict in it. */
export const factsOf = (voice: Voice) => [
  sourceOf(voice.source),
  genderOf(voice.gender),
  voice.needsKey ? "Schlüssel nötig" : voice.downloadBytes ? weighs(voice.downloadBytes) : "",
].filter(Boolean).join(" · ");

/**
 * What has to be said out loud about a voice rather than implied.
 *
 * The board is a wall device. „Braucht Netz" is not a slow start there, it is
 * silence — and `offline` is per voice rather than per source: Chrome lists its
 * Google voices beside the ones on the machine and they are synthesised on
 * Google's servers. Levelling is the other half: a system voice never goes
 * through the loudness chain, so it will not match the ones beside it, and that
 * is invisible until two appointments in a row are read out.
 */
export function caveats(voice: Voice): string[] {
  const said: string[] = [];
  if (!voice.makesFile) said.push("Wird nicht angeglichen — sie ist lauter oder leiser als die anderen.");
  if (!voice.offline) said.push("Spricht über das Netz. Hat das Board keins, bleibt sie stumm.");
  if (voice.rushesFragments) said.push("Spricht einzelne Wörter sehr kurz. Mit einem Satzzeichen am Ende nimmt sie sich Zeit.");
  return said;
}

export const nameOf = (voices: readonly Voice[], id: string | undefined) =>
  voices.find(voice => voice.id === id)?.name ?? "";
