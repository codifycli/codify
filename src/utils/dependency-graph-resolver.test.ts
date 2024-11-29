import { describe, expect, it } from 'vitest';
import { DependencyGraphResolver } from './dependency-graph-resolver.js';

describe('Dependency graph resolver tests', () => {
  it('Returns resource configs in the correct order', () => {
    const list = [
      { type: 'first', dependencies: [] },
      { type: 'third', dependencies: ['second'] },
      { type: 'second', dependencies: ['first'] },
      { type: 'fourth', dependencies: ['third'] },
    ]

    const result = DependencyGraphResolver.calculateDependencyList(
      list,
      (item: any) => item.type,
      (item: any) => item.dependencies
    );

    expect(result).to.deep
      .eq([
        'first',
        'second',
        'third',
        'fourth'
      ]);
  })

  it('Detects cycles within the dependency graph', () => {
    const list = [
      { type: 'first', dependencies: ['first'] },
      { type: 'third', dependencies: ['second'] },
      { type: 'second', dependencies: ['first'] },
      { type: 'fourth', dependencies: ['third'] },
    ]

    const result = expect(() => DependencyGraphResolver.calculateDependencyList(
      list,
      (item: any) => item.type,
      (item: any) => item.dependencies
    )).to.throw();
  })

})
