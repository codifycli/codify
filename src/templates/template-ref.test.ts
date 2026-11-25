import { describe, expect, it } from 'vitest';

import { formatTemplateRef, parseTemplateRef } from './template-ref.js';

describe('parseTemplateRef', () => {
  it('splits a pinned version', () => {
    expect(parseTemplateRef('@codify/nvm@1.2.0')).toEqual({ source: '@codify/nvm', version: '1.2.0' });
    expect(parseTemplateRef('nvm@2.0.0-beta.1')).toEqual({ source: 'nvm', version: '2.0.0-beta.1' });
  });

  it('leaves names without a version alone', () => {
    expect(parseTemplateRef('@codify/nvm')).toEqual({ source: '@codify/nvm' });
    expect(parseTemplateRef('nvm')).toEqual({ source: 'nvm' });
    expect(parseTemplateRef('@codify/nvm@latest')).toEqual({ source: '@codify/nvm@latest' });
  });

  it('formats back', () => {
    expect(formatTemplateRef({ source: '@codify/nvm', version: '1.2.0' })).toBe('@codify/nvm@1.2.0');
    expect(formatTemplateRef({ source: 'nvm' })).toBe('nvm');
  });
});
