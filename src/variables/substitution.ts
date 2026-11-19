import { SAVED_KEY_PATTERN } from './saved-references.js';

/**
 * ${{ name }} references to variables, and ${{ secrets.user.NAME }} references to saved variables and secrets (see
 * saved-references.ts). `$${{ name }}` is an escaped, literal `${{ name }}`.
 */

const NAME_PATTERN = String.raw`[\w\-]+|${SAVED_KEY_PATTERN}`;
// Group 1: the escape ($ in front), group 2: the variable name
const REFERENCE_REGEX = new RegExp(String.raw`(\$?)\$\{\{\s*(${NAME_PATTERN})\s*\}\}`, 'gu');
const EXACT_REFERENCE_REGEX = new RegExp(String.raw`^\s*\$\{\{\s*(${NAME_PATTERN})\s*\}\}\s*$`, 'u');
/** Names of the variables referenced in a value (strings at any depth). Escaped references are ignored. */
export function findReferences(value: unknown, names = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    for (const [, escape, name] of value.matchAll(REFERENCE_REGEX)) {
      if (!escape) {
        names.add(name);
      }
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      findReferences(item, names);
    }
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) {
      findReferences(item, names);
    }
  }

  return names;
}

/**
 * Replaces the references in a value (strings at any depth).
 *   - A string that is exactly one reference becomes the value of the variable (keeps numbers, booleans and lists).
 *   - Otherwise the references are replaced by the text of the value (lists are joined with ",").
 *   - Escaped references ($${{ name }}) become a literal ${{ name }}.
 *
 * @param lookup returns the value of a variable. Throws if the variable can't be used.
 */
export function substitute(value: unknown, lookup: (name: string) => unknown): unknown {
  if (typeof value === 'string') {
    const exact = EXACT_REFERENCE_REGEX.exec(value);
    if (exact) {
      return lookup(exact[1]);
    }

    return value.replaceAll(REFERENCE_REGEX, (match, escape: string, name: string) =>
      escape ? match.slice(1) : toText(lookup(name))
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => substitute(item, lookup));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substitute(item, lookup)]));
  }

  return value;
}

function toText(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(',') : String(value);
}
