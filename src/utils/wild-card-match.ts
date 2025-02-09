// JavaScript program for wild card matching using single traversal. From: https://www.geeksforgeeks.org/wildcard-pattern-matching/
// O(n) time and O(1) space complexity
export function wildCardMatch(txt: string, pat: string) {
  const n = txt.length;
  const m = pat.length;
  let i = 0, j = 0, startIndex = -1, match = 0;

  while (i < n) {

    // Characters match or '?' in pattern matches
    // any character.
    if (j < m && (pat[j] === '?' || pat[j] === txt[i])) {
      i++;
      j++;
    }

    else if (j < m && pat[j] === '*') {

      // Wildcard character '*', mark the current
      // position in the pattern and the text as a
      // proper match.
      startIndex = j;
      match = i;
      j++;
    }

    else if (startIndex !== -1) {

      // No match, but a previous wildcard was found.
      // Backtrack to the last '*' character position
      // and try for a different match.
      j = startIndex + 1;
      match++;
      i = match;
    }

    else {

      // If none of the above cases comply, the
      // pattern does not match.
      return false;
    }
  }

  // Consume any remaining '*' characters in the given
  // pattern.
  while (j < m && pat[j] === '*') {
    j++;
  }

  // If we have reached the end of both the pattern and
  // the text, the pattern matches the text.
  return j === m;
}
