import { ArasaacProvider, MetacomProvider, type Candidate, type ProviderStatus } from "@lautstark/bildquelle";
import type { Source, SymbolRef } from "./model.js";

/* Symbols are read, never served. METACOM comes out of the household's own
   licensed folder through the File System Access API and reaches the page as an
   object URL; nothing derived from that folder leaves the browser. ARASAAC is
   fetched from its public API. See ADR 002 and bildquelle's README. */
export const metacom = new MetacomProvider();
export const arasaac = new ArasaacProvider("de");
const providers = { metacom, arasaac } as const;

/** Bring a folder chosen on an earlier visit back without prompting. */
export const restore = () => metacom.restore();
export const connect = () => metacom.pickDirectory();
export const reconnect = () => metacom.requestPermission();
export const supported = () => typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

export const search = (source: Source, query: string): Promise<Candidate[]> => providers[source].search(query);
export const refFor = (source: Source, candidate: Candidate): SymbolRef => ({ source, id: candidate.id, label: candidate.label });
export const attributions = () => [metacom, arasaac].filter(provider => provider.isReady() && provider.attribution).map(provider => provider.attribution!);

const key = (ref: SymbolRef) => `${ref.source}:${ref.id}`;
/** Resolve every symbol a render needs in one pass, so drawing stays synchronous. */
export async function pictures(refs: SymbolRef[]): Promise<Map<string, string>> {
  const wanted = new Map(refs.map(ref => [key(ref), ref]));
  const found = new Map<string, string>();
  await Promise.all([...wanted].map(async ([id, ref]) => {
    const url = await providers[ref.source].getImageUrl(ref.id).catch(() => null);
    if (url) found.set(id, url);
  }));
  return found;
}
export const pictureFor = (urls: Map<string, string>, ref: SymbolRef) => urls.get(key(ref)) ?? null;

/* The package answers with codes and never with words, so that a host is not
   handed German it cannot translate. These are ours. */
export function says(status: ProviderStatus): string {
  switch (status.kind) {
    case "ready": return "METACOM-Ordner verbunden.";
    case "loading": return "METACOM-Ordner wird gelesen …";
    case "needs-setup": return status.code === "no-folder"
      ? "Noch kein METACOM-Ordner gewählt. Die Symbole bleiben leer, bis du deinen eigenen verbindest."
      : "Der Browser braucht die Erlaubnis für den METACOM-Ordner erneut. Ein Klick genügt.";
    case "error": switch (status.code) {
      case "no-images": return "In diesem Ordner liegen keine Symbole. Ist es der richtige?";
      case "read-failed": return "Der METACOM-Ordner ließ sich nicht lesen. Prüfe, ob er noch am selben Platz liegt.";
      case "network": return "Die Symbolsuche ist gerade nicht erreichbar.";
    }
  }
}
