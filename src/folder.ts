import { Ablage } from "@lautstark/sicherung/ablage";
import type { Appointment, Card, Person, Series } from "./model.js";

/* The calendar in a folder, rather than only in this browser.
 *
 * A household keeps its week *either* in IndexedDB *or* in a folder it chose —
 * never in both as sources, so there is never a second truth to reconcile. Where
 * a folder is connected it is the truth and IndexedDB is a mirror of it: read
 * wholesale on start, written to on every edit, and served read-only while the
 * folder is out of reach. See ADR 002 and sicherung's adr/0001.
 *
 * Nothing here decides anything about a record. It moves records, and it says
 * which direction they went. */

export const KINDS = ["termine", "karten", "personen", "serien"] as const;
export type Kind = (typeof KINDS)[number];
export type Filed = Appointment | Card | Person | Series;

export const ablage = new Ablage({ app: "wochenwerk", kinds: KINDS });
export const supported = Ablage.supported;

/** Whether the folder is the store rather than a copy of one. */
export const isStore = () => ablage.status.kind !== "off" && ablage.status.kind !== "unsupported";
/** Whether it is the store but currently out of reach. */
export const isStale = () => ablage.status.kind === "stale";

/* A write reaches the folder only where the folder is the store, and never while
   it is stale — a mirror that took writes nobody else can see would be the second
   source of truth this whole arrangement exists to avoid. */
export async function file(kind: Kind, record: Filed): Promise<void> {
  if (!isStore() || isStale()) return;
  await ablage.write(kind, { ...record, updatedAt: record.updatedAt ?? Date.now() });
}
export async function unfile(kind: Kind, id: string): Promise<void> {
  if (!isStore() || isStale()) return;
  await ablage.remove(kind, id);
}

/* A batch — a series written, a reach deleted, a calendar emptied — happens inside
   one IndexedDB transaction, and reaching into that to file each record would put
   a folder write inside a transaction that has to stay open. So a batch is
   mirrored afterwards, wholesale: what the browser now holds is written where the
   folder disagrees, and what the browser no longer holds is removed. */
export async function pushKind(kind: Kind, records: Filed[]): Promise<void> {
  if (!isStore() || isStale()) return;
  const there = new Map((await ablage.list(kind)).map(item => [item.id, item.updatedAt]));
  const here = new Set(records.map(record => record.id));
  for (const record of records) {
    if (there.get(record.id) === record.updatedAt) continue;
    await ablage.write(kind, { ...record, updatedAt: record.updatedAt ?? Date.now() });
  }
  for (const id of there.keys()) if (!here.has(id)) await ablage.remove(kind, id);
}

export const readKind = <T extends Filed>(kind: Kind) => ablage.all(kind) as Promise<T[]>;
export const changes = () => ablage.poll();
export const conflicts = () => ablage.conflicts();

/* Somebody else's edit reaches this browser as a file that changed under it. A
   poll rather than a subscription, because a folder that syncs from elsewhere
   has nothing to notify with — the file simply differs the next time it is read.
   Half a minute is chosen against the thing being shared: a household planning a
   week is not racing anyone. */
export const watchFolder = (onChange: () => void) =>
  ablage.watch(30_000, changes => { if (changes.length) onChange(); });
