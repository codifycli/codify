/** The number of single character edits (insert, delete, replace) needed to turn `a` into `b` */
export function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }

    previous = current;
  }

  return previous[b.length];
}

/** The candidate that is probably what was meant: same text ignoring case or at most `maxDistance` edits away */
export function closestMatch(value: string, candidates: string[], maxDistance = 2): string | undefined {
  let best: undefined | { candidate: string; distance: number };
  for (const candidate of candidates) {
    if (candidate === value) continue;

    const distance = levenshtein(candidate.toLowerCase(), value.toLowerCase());
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { candidate, distance };
    }
  }

  return best?.candidate;
}
