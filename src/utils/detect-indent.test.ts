import { describe, expect, it } from 'vitest';

import { detectIndent } from './detect-indent.js';

describe('detectIndent', () => {
  it('detects the most used indentation', () => {
    expect(detectIndent('[\n  {\n    "a": 1\n  }\n]')).toBe('  ');
    expect(detectIndent('[\n    {\n        "a": 1\n    }\n]')).toBe('    ');
    expect(detectIndent('[\n\t{\n\t\t"a": 1\n\t}\n]')).toBe('\t');
  });

  it('ignores single spaces unless nothing else is indented', () => {
    expect(detectIndent('/**\n * comment\n */\n[\n  1\n]')).toBe('  ');
    expect(detectIndent('a\n b\nc\n d')).toBe(' ');
  });

  it('returns an empty string for unindented text', () => {
    expect(detectIndent('')).toBe('');
    expect(detectIndent('[1, 2]')).toBe('');
  });
});
