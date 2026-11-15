import { ResourceDefinition } from '@codifycli/schemas';
import { describe, expect, it } from 'vitest';

import { removeSupersededTypes } from '../../src/utils/superseded-types.js';

const definitions = new Map<string, ResourceDefinition>([
  ['alias', { type: 'alias', dependencies: [], supersededBy: 'aliases' }],
  ['aliases', { type: 'aliases', dependencies: [] }],
  ['git-repository', { type: 'git-repository', dependencies: [], supersededBy: 'git-repositories' }],
  ['homebrew', { type: 'homebrew', dependencies: [] }],
]);

describe('removeSupersededTypes', () => {
  it('Removes types whose superseding type is also being imported', () => {
    expect(removeSupersededTypes(['alias', 'aliases', 'homebrew'], definitions)).toEqual(['aliases', 'homebrew']);
  });

  it('Keeps a superseded type if the type that supersedes it is not in the list', () => {
    // ex: git-repositories was filtered out for the current OS or isn't installed
    expect(removeSupersededTypes(['git-repository', 'homebrew'], definitions)).toEqual(['git-repository', 'homebrew']);
  });

  it('Keeps types that are not in the resource definitions', () => {
    expect(removeSupersededTypes(['unknown'], definitions)).toEqual(['unknown']);
  });
});
