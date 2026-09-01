/*
 * Nobody real goes in this repository.
 *
 * A household's calendar is what this software is for, so the household's own
 * week is the most natural thing in the world to paste into a doc or a fixture
 * while working — and it did happen: a child's name, their therapy and the times
 * of it sat in docs/product.md and in three commits behind it. A public
 * repository publishes its history, so the fix for that was a rewrite, and a
 * rewrite is not a thing to need twice.
 *
 * The terms to refuse are deliberately NOT in this file. Listing them here would
 * put the names back in the repository under a different heading. They live in
 * `.private-names`, which is git-ignored: one term per line, blank lines and
 * `#` comments skipped, matched case-insensitively against the working tree.
 *
 * Without that file this check passes and says so. That is the honest behaviour
 * for a contributor who has no household to protect, and it is why the check is
 * a floor rather than a guarantee: it catches the names somebody thought to
 * write down, not the ones they did not.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const listing = join(root, '.private-names');
const SKIP = new Set(['node_modules', '.git', 'dist', '.claude', 'tools']);
const READABLE = /\.(ts|tsx|js|mjs|json|md|css|html|txt|yml|yaml)$/;

if (!existsSync(listing)) {
  console.log('no-private: no .private-names, nothing to check against.');
  process.exit(0);
}

const terms = readFileSync(listing, 'utf8')
  .split('\n').map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((term) => term.toLowerCase());

if (!terms.length) {
  console.log('no-private: .private-names is empty, nothing to check against.');
  process.exit(0);
}

const found = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { walk(path); continue; }
    if (!READABLE.test(entry)) continue;
    const text = readFileSync(path, 'utf8').toLowerCase();
    for (const term of terms) {
      if (text.includes(term)) found.push(`${relative(root, path)} contains a term from .private-names`);
    }
  }
};
walk(root);

if (found.length) {
  console.error('\nno-private: this repository is public and its history is published.\n');
  for (const line of found) console.error(`  ${line}`);
  console.error('\nUse a placeholder. If the term is a false positive, narrow the entry in .private-names.\n');
  process.exit(1);
}
console.log(`no-private: clean against ${terms.length} term(s).`);
