/* Two changes to one record, kept both where they can be. ADR 006.

   Three versions go in: what the record was before either change (`base`), ours
   and theirs. Every field is asked who changed it. Only a field both sides set
   to different values is a clash, and there the newer side wins that field and
   nothing else. No DOM and no store — the store decides when to ask. */

type Plain = Record<string, unknown>;
const plain = (value: unknown): value is Plain =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** The same value, whatever order its keys were written in. */
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => equal(item, b[index]));
  if (plain(a) && plain(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every(key => equal(a[key], b[key]));
  }
  return false;
}

/* Fields that are a set and not a value: a series' days taken out one at a time.
   Monday taken out here and Wednesday there is both taken out, not a clash. */
const SETS = new Set(["skipped"]);
function mergeSet(base: unknown[], mine: unknown[], theirs: unknown[]): unknown[] {
  const has = (list: unknown[], item: unknown) => list.some(other => equal(other, item));
  const dropped = (side: unknown[]) => base.filter(item => !has(side, item));
  const gone = [...dropped(mine), ...dropped(theirs)];
  const all: unknown[] = [];
  for (const item of [...mine, ...theirs]) if (!has(all, item) && !has(gone, item)) all.push(item);
  return all.sort();
}

/* Not fields anybody edits: who the record is, when it was stamped, and the
   shape number the folder writes into every file. */
const OWN = new Set(["id", "updatedAt", "v"]);

export type Merged<T> = { merged: T; clashed: string[] };

/**
 * Merge two changes made to `base`. `mineIsNewer` settles the fields both
 * changed differently; `clashed` names them, by path.
 */
export function merge3<T extends object>(base: T, mine: T, theirs: T, mineIsNewer: boolean): Merged<T> {
  const clashed: string[] = [];
  const walk = (b: unknown, m: unknown, t: unknown, path: string[]): unknown => {
    if (equal(m, t)) return m;
    if (equal(m, b)) return t;
    if (equal(t, b)) return m;
    const name = path[path.length - 1] ?? "";
    if (SETS.has(name) && Array.isArray(m) && Array.isArray(t)) return mergeSet(Array.isArray(b) ? b : [], m, t);
    if (plain(m) && plain(t) && (plain(b) || b === undefined)) {
      const before: Plain = plain(b) ? b : {};
      const out: Plain = {};
      for (const key of new Set([...Object.keys(m), ...Object.keys(t)])) {
        if (path.length === 0 && OWN.has(key)) continue;
        const value = walk(before[key], m[key], t[key], [...path, key]);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    clashed.push(path.join("."));
    return mineIsNewer ? m : t;
  };
  const merged = walk(base, mine, theirs, []) as Plain;
  return { merged: { ...merged, id: (mine as Plain).id } as T, clashed };
}
