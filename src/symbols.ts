import { attributionsFor, foldGerman, getProvider, metacom, MetacomProvider, needsAttention, PROVIDER_IDS,
  type Candidate, type ProviderId, type ProviderStatus } from "@lautstark/bildquelle";
import type { SymbolRef } from "./model.js";

/* Symbols are read, never served. METACOM comes out of the household's own licensed
   folder through the File System Access API and reaches the page as an object URL;
   nothing derived from that folder leaves the browser. ARASAAC is fetched from its
   public API. The providers are the package's own singletons, so every surface that
   asks is asking the same one. See ADR 002 and bildquelle's README. */
export { metacom, needsAttention, PROVIDER_IDS, foldGerman };
export type { Candidate, ProviderId, ProviderStatus };

/** Chromium keeps a chosen folder across visits; everywhere else there is no picker. */
export const supportsPicker = MetacomProvider.supportsPersistentPicker;
export const restore = () => metacom.restore();
export const connect = () => metacom.pickDirectory();
export const useFolderFiles = (files: FileList | File[]) => metacom.useFileList(files);
export const useZip = (file: File) => metacom.useZip(file);
export const reconnect = () => metacom.requestPermission();
export const rebuild = () => metacom.rebuildIndex();
export const forget = () => metacom.forget();

export const search = (source: ProviderId, query: string): Promise<Candidate[]> => getProvider(source).search(query);
export const refFor = (source: ProviderId, candidate: Candidate): SymbolRef => ({ source, id: candidate.id, label: candidate.label });
export const owed = (refs: SymbolRef[]) => attributionsFor(refs.map(ref => ref.source));

const key = (ref: SymbolRef) => `${ref.source}:${ref.id}`;
/** Resolve every symbol a render needs in one pass, so drawing stays synchronous. */
export async function pictures(refs: SymbolRef[]): Promise<Map<string, string>> {
  const wanted = new Map(refs.map(ref => [key(ref), ref]));
  const found = new Map<string, string>();
  await Promise.all([...wanted].map(async ([id, ref]) => {
    const url = await getProvider(ref.source).getImageUrl(ref.id).catch(() => null);
    if (url) found.set(id, url);
  }));
  return found;
}
export const pictureFor = (urls: Map<string, string>, ref: SymbolRef) => urls.get(key(ref)) ?? null;

/* The package answers with codes and never with words, so that a host is not handed
   German it cannot translate. These are ours. */
export function says(status: ProviderStatus): string {
  switch (status.kind) {
    case "ready": return "Ordner verbunden.";
    case "loading": return status.code === "indexing" ? "Ordner wird gelesen …" : "Wird geladen …";
    case "needs-setup": return status.code === "no-folder"
      ? "Noch kein METACOM-Ordner gewählt."
      : "Der Browser braucht die Erlaubnis für den Ordner erneut.";
    case "error": switch (status.code) {
      case "no-images": return "In diesem Ordner liegen keine Bilder. Zeigt er auf PNG_ohne_Rahmen?";
      case "read-failed": return "Der Ordner ließ sich nicht lesen.";
      case "network": return "Die Symbolsuche ist gerade nicht erreichbar.";
    }
  }
}
