import { describe, expect, it } from 'vitest';
import { DependencyGraphResolver } from '../../src/utils/dependency-graph-resolver.js';

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


  const resolve = (list: Array<{ id: string; deps: string[] }>) => DependencyGraphResolver.calculateDependencyList(
    list,
    (item) => item.id,
    (item) => item.deps,
  );

  it('Keeps the declaration order for independent resources', () => {
    expect(resolve([
      { id: 'a', deps: [] },
      { id: 'b', deps: [] },
      { id: 'c', deps: [] },
      { id: 'd', deps: [] },
    ])).to.deep.eq(['a', 'b', 'c', 'd']);
  })

  it('Only moves resources when a dependency requires it', () => {
    expect(resolve([
      { id: 'a', deps: [] },
      { id: 'b', deps: [] },
      { id: 'c', deps: ['a'] },
      { id: 'd', deps: [] },
    ])).to.deep.eq(['a', 'b', 'c', 'd']);

    // c depends on d which is declared later. Only c moves (directly after d), everything else stays in place
    expect(resolve([
      { id: 'a', deps: [] },
      { id: 'c', deps: ['d'] },
      { id: 'b', deps: [] },
      { id: 'd', deps: [] },
      { id: 'e', deps: [] },
    ])).to.deep.eq(['a', 'b', 'd', 'c', 'e']);
  })

  it('Ignores duplicate dependency ids', () => {
    expect(resolve([
      { id: 'a', deps: [] },
      { id: 'b', deps: ['a', 'a'] },
    ])).to.deep.eq(['a', 'b']);
  })
})
