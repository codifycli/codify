import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { isUuid } from './uuid.js';

describe('isUuid', () => {
  it('accepts uuids', () => {
    expect(isUuid(randomUUID())).toBe(true);
    expect(isUuid(randomUUID().toUpperCase())).toBe(true);
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isUuid('./codify.jsonc')).toBe(false);
    expect(isUuid('123e4567-e89b-02d3-a456-426614174000')).toBe(false); // version 0
    expect(isUuid('123e4567-e89b-12d3-c456-426614174000')).toBe(false); // bad variant
    expect(isUuid(undefined)).toBe(false);
  });
});
