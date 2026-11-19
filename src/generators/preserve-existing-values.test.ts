import { describe, expect, it } from 'vitest';

import { hasVariable, mergeImportedIntoExisting, preserveVariables } from './preserve-existing-values.js';

describe('preserve existing values', () => {
  it('detects variables', () => {
    expect(hasVariable('${{ projectName }}')).toBe(true);
    expect(hasVariable('~/projects/${{project-name}}/src')).toBe(true);
    expect(hasVariable('${homebrew.0}')).toBe(true);
    expect(hasVariable('$HOME/.zshrc')).toBe(true);
    expect(hasVariable('${HOME}/.zshrc')).toBe(true);
    expect(hasVariable(['a', { b: '${{ c }}' }])).toBe(true);

    expect(hasVariable('plain value')).toBe(false);
    expect(hasVariable('costs $5')).toBe(false);
    expect(hasVariable(['a', 'b', 1, true, null])).toBe(false);
    expect(hasVariable({ a: { b: 'c' } })).toBe(false);
  })

  it('keeps strings with variables and ignores the imported value', () => {
    expect(preserveVariables('~/projects/${{ name }}', '/Users/me/projects/site')).toBe('~/projects/${{ name }}');
    expect(preserveVariables('$HOME/.zshrc', '/Users/me/.zshrc')).toBe('$HOME/.zshrc');
    expect(preserveVariables('old', 'new')).toBe('new');
  })

  it('keeps arrays with variables as is', () => {
    expect(preserveVariables(['${{ pkg }}', 'pnpm'], ['typescript', 'pnpm', 'yarn'])).toEqual(['${{ pkg }}', 'pnpm']);
    expect(preserveVariables(['a', 'b'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  })

  it('merges objects key by key', () => {
    expect(preserveVariables(
      { path: '${{ dir }}', version: '1.0.0', token: '${{ token }}', removed: 'x' },
      { path: '/Users/me/site', version: '2.0.0', added: true },
    )).toEqual({ path: '${{ dir }}', version: '2.0.0', added: true, token: '${{ token }}' });
  })

  it('a declared variable wins over a different imported type', () => {
    expect(preserveVariables('${{ config }}', { a: 1 })).toBe('${{ config }}');
  })

  it('keeps the core properties of the existing declaration', () => {
    expect(mergeImportedIntoExisting(
      { type: 'npm', name: 'frontend', dependsOn: ['nvm'], os: ['macOS'], distro: ['ubuntu'], globalInstall: ['a'] },
      { globalInstall: ['a', 'b'] },
    )).toEqual({
      type: 'npm', name: 'frontend', dependsOn: ['nvm'], os: ['macOS'], distro: ['ubuntu'], globalInstall: ['a', 'b'],
    });
  })

  it('the imported parameters can never change the core properties', () => {
    expect(mergeImportedIntoExisting(
      { type: 'npm', globalInstall: ['a'] },
      { name: '0', os: ['linux'], globalInstall: ['b'] },
    )).toEqual({ type: 'npm', globalInstall: ['b'] });
  })
})
