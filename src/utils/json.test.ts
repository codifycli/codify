import { describe, expect, it } from 'vitest';

import { parseJson5, parseStrictJson } from './json.js';

describe('json', () => {
  it('parses JSON5 and JSONC', () => {
    expect(parseJson5('// comment\n[{ type: \'brew\', formulae: [\'git\',], },]')).toEqual([{ formulae: ['git'], type: 'brew' }]);
  });

  it('keeps reserved keys as normal properties', () => {
    const parsed = parseJson5('{ "__proto__": { "polluted": true }, "constructor": 1 }') as Record<string, unknown>;
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.keys(parsed)).toEqual(['__proto__', 'constructor']);
    expect(parsed.constructor).toBe(1);
  });

  it('only accepts strict JSON and points at syntax errors', () => {
    expect(parseStrictJson('[{ "type": "brew" }]')).toEqual([{ type: 'brew' }]);
    expect(() => parseStrictJson('[\n  { "type": "brew", },\n]')).toThrow(/Trailing comma in object at 2:21/);
    expect(() => parseStrictJson('[1] // comment')).toThrow(/Unexpected token '\/' at 1:5/);
  });
});
