import { attributionsFor, foldGerman, getProvider, metacom, PROVIDER_IDS,
  type Candidate, type ProviderId, type ProviderStatus } from "@lautstark/bildquelle";
import type { SymbolRef } from "./model.js";

/* Symbols are read, never served. METACOM comes out of the household's own licensed
   folder through the File System Access API and reaches the page as an object URL;
   nothing derived from that folder leaves the browser. ARASAAC is fetched from its
   public API. The providers are the package's own singletons, so every surface that
   asks is asking the same one. See ADR 002 and bildquelle's README. */
export { metacom, PROVIDER_IDS, foldGerman };
export type { Candidate, ProviderId, ProviderStatus };

export const restore = () => metacom.restore();
/* A folder the household already dropped beside its calendar, adopted without a
   second file dialog. The capability is the same one the picker grants; what is
   saved is the picking, which is where setting up gets abandoned.

   The only one of these left. Picking a folder, reading a ZIP, re-reading,
   forgetting and asking for permission again were five more wrappers over five
   more `metacom` methods, each with one caller in the settings dialog — and
   @lautstark/bildquelle/metacom-panel now calls all five itself, from the block
   that draws the buttons. This one stays because no shared panel can have it:
   it is handed a directory the Ablage found, which is a folder question only
   this calendar knows how to ask. */
export const useFolder = (handle: FileSystemDirectoryHandle) => metacom.useDirectoryHandle(handle);

/* METACOM ships the same symbols several times over — with and without a frame,
   with and without the word printed on the picture — as parallel folders holding
   identical file names. `renderings()` derives which folder segments tell them
   apart from the index itself rather than from a list of known names, because a
   household's copy is its own: renamed, partial, or organised for a language the
   package has never seen.

   Preferring one is ordering only. Nothing is filtered out, so a symbol that
   exists in a single fassung stays reachable, and nothing already in the calendar
   changes. The preference lives in the settings record and is handed to the
   provider at boot: the package holds it for the tab and does not persist it. */
export const renderings = () => (metacom.isReady() ? metacom.renderings() : []);
export const preferRendering = (segment: string | null) => metacom.preferRendering(segment);
export const preferredRendering = () => metacom.preferredRendering;

/* Which source the household draws from. It is derived and never chosen: a
   connected METACOM folder is the answer, and without one it is ARASAAC. So there
   is no preference to keep, nothing that can disagree with the folder, and no
   household that has to pick before it can search. */
export const sourceInUse = (): ProviderId => (metacom.isReady() ? "metacom" : "arasaac");

export const search = (source: ProviderId, query: string): Promise<Candidate[]> => getProvider(source).search(query);
export const refFor = (source: ProviderId, candidate: Candidate): SymbolRef => ({ source, id: candidate.id, label: candidate.label });
export const owed = (refs: SymbolRef[]) => attributionsFor(refs.map(ref => ref.source));

const key = (ref: SymbolRef) => `${ref.source}:${ref.id}`;

/* A stored METACOM reference is the id the index gave when the symbol was picked,
   and the shape of that id is a fact about how the folder was reached: a picked
   directory indexes without its root, an uploaded file list with it, and a zip
   however the zip was made. So the same picture, in the same collection, has a
   different id depending on the route — and a household that re-picks its folder a
   different way would watch its whole calendar fall back to names.

   `idForName` is bildquelle's own lookup for exactly that, and it is asked with the
   preferred rendering in front of the name. A bare stem resolves in index order, so
   a household that has said „ohne Rahmen" and lost the qualified path would
   otherwise get the framed copy back — the right picture in the wrong fassung,
   which is the one failure this preference exists to prevent. */
const stem = (id: string) => id.replace(/\.[a-z0-9]+$/i, "");
async function urlFor(ref: SymbolRef): Promise<string | null> {
  const provider = getProvider(ref.source);
  const exact = await provider.getImageUrl(ref.id);
  if (exact || ref.source !== "metacom") return exact;
  const name = stem(ref.id), rendering = metacom.preferredRendering;
  const again = (rendering ? metacom.idForName(`${rendering}/${name.split("/").pop()}`) : null)
    ?? metacom.idForName(name);
  return again && again !== ref.id ? provider.getImageUrl(again) : null;
}

/** Resolve every symbol a render needs in one pass, so drawing stays synchronous. */
export async function pictures(refs: SymbolRef[]): Promise<Map<string, string>> {
  const wanted = new Map(refs.map(ref => [key(ref), ref]));
  const found = new Map<string, string>();
  await Promise.all([...wanted].map(async ([id, ref]) => {
    const url = await urlFor(ref).catch(() => null);
    if (url) found.set(id, url);
  }));
  return found;
}
export const pictureFor = (urls: Map<string, string>, ref: SymbolRef) => urls.get(key(ref)) ?? null;

/* `says()` used to stand here: a switch over every status code, in this
   calendar's own German, written because the package answers with codes and
   never with words. It had one caller, and both places it printed — the panel's
   heading and the warning inside it — are now the module's own
   `headlineFor`/`stateLineFor`, in the same words as the other three products.
   conventions.md §4.12 draws the line it crossed: a *status code* is a fact a
   host phrases in its own voice wherever it turns up, but the fixed furniture of
   one panel is the panel, and this switch was only ever asked for by that panel.
   The re-exported `ProviderStatus` stays for a host that shows a status
   somewhere else; nothing here does today. */
