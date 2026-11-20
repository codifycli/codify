import jju from 'jju';

/**
 * Parses JSON5 (and so JSONC). `reserved_keys: 'replace'` keeps keys like `__proto__` and `constructor` as normal
 * properties, like JSON.parse does (jju's default drops them, and `__proto__` would replace the prototype).
 */
export function parseJson5(text: string): unknown {
  return jju.parse(text, { reserved_keys: 'replace' });
}

/**
 * Parses strict JSON with JSON.parse. On a syntax error, the message comes from jju, which points at the location
 * with a snippet of the line.
 */
export function parseStrictJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    try {
      jju.parse(text, { mode: 'json', reserved_keys: 'replace' });
    } catch (jjuError) {
      throw new Error((jjuError as Error).message);
    }

    throw error;
  }
}
