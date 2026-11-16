import { describe, expect, it } from 'vitest';

import { Project } from '../../src/entities/project.js';
import { ResourceConfig } from '../../src/entities/resource-config.js';
import { DependencyGraphResolver } from '../../src/utils/dependency-graph-resolver.js';

interface Item {
  id: string;
  deps: string[];
}

const resolve = (list: Item[]) => DependencyGraphResolver.calculateDependencyList(
  list,
  (item) => item.id,
  (item) => item.deps,
);

// Shorthand: item('c', 'a', 'b') is { id: 'c', deps: ['a', 'b'] }
const item = (id: string, ...deps: string[]): Item => ({ id, deps });

// Deterministic pseudo random numbers so failures are reproducible
function prng(seed: number): () => number {
  let state = seed;
  return () => {
    state = Math.trunc(state + 0x6D_2B_79_F5);
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * A random acyclic graph declared in a shuffled order. Dependencies only point to nodes with a lower rank so there
 * are no cycles, but the declaration order is random so dependencies are often declared after their dependents.
 */
function randomGraph(random: () => number, size: number, edgeProbability: number): Item[] {
  const ranked = Array.from({ length: size }, (_, i) => `n${i}`);
  const items = ranked.map((id, rank) => item(id, ...ranked.slice(0, rank).filter(() => random() < edgeProbability)));

  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return items;
}

function assertDependenciesFirst(items: Item[], order: string[]) {
  const position = new Map(order.map((id, idx) => [id, idx]));
  for (const { id, deps } of items) {
    for (const dep of deps) {
      expect(position.get(dep)!, `${dep} must come before ${id} in [${order.join(', ')}]`).toBeLessThan(position.get(id)!);
    }
  }
}

/**
 * Every valid order (all dependencies before dependents), found by brute force. Only for small graphs.
 */
function allValidOrders(items: Item[]): string[][] {
  const result: string[][] = [];
  const visit = (placed: string[], remaining: Item[]) => {
    if (remaining.length === 0) {
      result.push(placed);
      return;
    }

    for (const candidate of remaining) {
      if (candidate.deps.every((d) => placed.includes(d))) {
        visit([...placed, candidate.id], remaining.filter((r) => r !== candidate));
      }
    }
  };

  visit([], items);
  return result;
}

// Compares two orders by the declaration position of their elements, position by position
function compareByDeclaration(items: Item[], a: string[], b: string[]): number {
  const declared = new Map(items.map((it, idx) => [it.id, idx]));
  for (let i = 0; i < a.length; i++) {
    const diff = declared.get(a[i])! - declared.get(b[i])!;
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

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

  describe('Without dependencies', () => {
    it('Returns an empty list for no values', () => {
      expect(resolve([])).to.deep.eq([]);
    })

    it('Returns a single value', () => {
      expect(resolve([item('a')])).to.deep.eq(['a']);
    })

    it('Keeps the declaration order exactly', () => {
      expect(resolve([item('a'), item('b'), item('c'), item('d')])).to.deep.eq(['a', 'b', 'c', 'd']);
    })

    it('Keeps the declaration order instead of sorting (by id or otherwise)', () => {
      const ids = ['zsh', 'homebrew', 'nvm', 'alias.0', 'git', 'alias.1', 'action', 'xcode-tools'];
      expect(resolve(ids.map((id) => item(id)))).to.deep.eq(ids);

      const reversed = [...ids].reverse();
      expect(resolve(reversed.map((id) => item(id)))).to.deep.eq(reversed);
    })

    it('Keeps the declaration order for large lists', () => {
      const ids = Array.from({ length: 500 }, (_, i) => `resource-${(i * 7919) % 500}`);
      expect(resolve(ids.map((id) => item(id)))).to.deep.eq(ids);
    })
  })

  describe('Stable ordering with dependencies', () => {
    it('Does not change an order that already satisfies every dependency', () => {
      const items = [
        item('a'),
        item('b', 'a'),
        item('x'),
        item('c', 'b'),
        item('y'),
        item('d', 'a', 'c'),
      ];

      expect(resolve(items)).to.deep.eq(['a', 'b', 'x', 'c', 'y', 'd']);
    })

    it('Only moves the dependent, directly after its dependency', () => {
      // c depends on d which is declared later. Only c moves, everything else stays in place
      expect(resolve([
        item('a'),
        item('c', 'd'),
        item('b'),
        item('d'),
        item('e'),
      ])).to.deep.eq(['a', 'b', 'd', 'c', 'e']);
    })

    it('Moves a dependent together with the resources that depend on it', () => {
      // b depends on z (declared last), c depends on b. a, x and y are unaffected
      expect(resolve([
        item('a'),
        item('b', 'z'),
        item('c', 'b'),
        item('x'),
        item('y'),
        item('z'),
      ])).to.deep.eq(['a', 'x', 'y', 'z', 'b', 'c']);
    })

    it('Waits for the last dependency when a resource has several', () => {
      expect(resolve([
        item('d', 'a', 'c'),
        item('a'),
        item('b'),
        item('c'),
        item('e'),
      ])).to.deep.eq(['a', 'b', 'c', 'd', 'e']);
    })

    it('Reverses a chain that is declared backwards, keeping independent resources in place', () => {
      expect(resolve([
        item('x'),
        item('c', 'b'),
        item('b', 'a'),
        item('a'),
        item('y'),
      ])).to.deep.eq(['x', 'a', 'b', 'c', 'y']);
    })

    it('Orders diamonds by declaration order', () => {
      // a → (c, b) → d. c is declared before b so it comes first
      expect(resolve([
        item('d', 'b', 'c'),
        item('c', 'a'),
        item('b', 'a'),
        item('a'),
      ])).to.deep.eq(['a', 'c', 'b', 'd']);
    })

    it('Keeps a block of resources (e.g. from a template) at its declared position', () => {
      // t1..t3 come from a template declared between before and after. t2 depends on a later resource
      expect(resolve([
        item('before'),
        item('t1'),
        item('t2', 'later'),
        item('t3'),
        item('after'),
        item('later'),
      ])).to.deep.eq(['before', 't1', 't3', 'after', 'later', 't2']);
    })

    it('Ignores duplicate dependency ids', () => {
      expect(resolve([item('a'), item('b', 'a', 'a')])).to.deep.eq(['a', 'b']);
      expect(resolve([item('b', 'a', 'a'), item('a')])).to.deep.eq(['a', 'b']);
    })

    it('Does not modify the input', () => {
      const items = [item('b', 'a'), item('a')];
      const copy = structuredClone(items);

      resolve(items);
      expect(items).to.deep.eq(copy);
    })
  })

  describe('Properties (random graphs)', () => {
    it('Always places dependencies before their dependents', () => {
      const random = prng(1);
      for (let run = 0; run < 200; run++) {
        const items = randomGraph(random, 2 + Math.floor(random() * 30), random() * 0.3);
        const order = resolve(items);

        expect(order).toHaveLength(items.length);
        expect(new Set(order).size).toBe(items.length);
        assertDependenciesFirst(items, order);
      }
    })

    it('Returns the valid order closest to the declaration order (minimal changes)', () => {
      // Of every valid order, the result is the one that keeps the earliest declared resources first
      const random = prng(2);
      for (let run = 0; run < 150; run++) {
        const items = randomGraph(random, 1 + Math.floor(random() * 6), random() * 0.6);
        const best = allValidOrders(items).sort((a, b) => compareByDeclaration(items, a, b))[0];

        expect(resolve(items), JSON.stringify(items)).to.deep.eq(best);
      }
    })

    it('Returns the input unchanged when it is already a valid order', () => {
      const random = prng(3);
      for (let run = 0; run < 100; run++) {
        const items = randomGraph(random, 2 + Math.floor(random() * 25), random() * 0.3);
        const order = resolve(items);
        const reordered = order.map((id) => items.find((i) => i.id === id)!);

        expect(resolve(reordered)).to.deep.eq(order);
      }
    })
  })

  describe('Errors', () => {
    it('Detects cycles within the dependency graph', () => {
      const list = [
        { type: 'first', dependencies: ['first'] },
        { type: 'third', dependencies: ['second'] },
        { type: 'second', dependencies: ['first'] },
        { type: 'fourth', dependencies: ['third'] },
      ]

      expect(() => DependencyGraphResolver.calculateDependencyList(
        list,
        (item: any) => item.type,
        (item: any) => item.dependencies
      )).to.throw();
    })

    it('Detects a resource that depends on itself', () => {
      expect(() => resolve([item('a', 'a')])).to.throw(/Cyclic dependency/);
    })

    it('Detects a cycle when every resource is part of it', () => {
      expect(() => resolve([item('a', 'b'), item('b', 'a')])).to.throw(/Cyclic dependency/);
    })

    it('Names the resources in a cycle', () => {
      expect(() => resolve([
        item('a'),
        item('b', 'c'),
        item('c', 'd'),
        item('d', 'b'),
        item('e', 'a'),
      ])).to.throw('Cyclic dependency found in configs. Ids: [b, c, d]');
    })

    it('Throws for a dependency that does not exist', () => {
      expect(() => resolve([item('a', 'missing')])).to.throw(/missing does not exist/);
    })
  })

  describe('Project evaluation order', () => {
    const project = (...configs: ResourceConfig[]) => {
      const p = new Project(null, configs, []);
      p.resolveDependenciesAndCalculateEvalOrder();
      return p.evaluationOrder;
    };

    it('Keeps the declaration order of resources without dependencies', () => {
      expect(project(
        new ResourceConfig({ type: 'nvm' }),
        new ResourceConfig({ type: 'alias', name: 'gs' }),
        new ResourceConfig({ type: 'homebrew' }),
        new ResourceConfig({ type: 'alias', name: 'ls' }),
      )).to.deep.eq(['nvm', 'alias.gs', 'homebrew', 'alias.ls']);
    })

    it('Keeps the order of duplicate resources (named in declaration order)', () => {
      expect(project(
        new ResourceConfig({ type: 'git-clone', repository: 'a' }),
        new ResourceConfig({ type: 'homebrew' }),
        new ResourceConfig({ type: 'git-clone', repository: 'b' }),
      )).to.deep.eq(['git-clone.0', 'homebrew', 'git-clone.1']);
    })

    it('Moves resources only as far as dependsOn and parameter references require', () => {
      expect(project(
        new ResourceConfig({ type: 'nvm', dependsOn: ['homebrew'] }),
        new ResourceConfig({ type: 'alias', name: 'gs' }),
        new ResourceConfig({ type: 'homebrew' }),
        new ResourceConfig({ type: 'npm', global: '${nvm}' }),
        new ResourceConfig({ type: 'alias', name: 'ls' }),
      )).to.deep.eq(['alias.gs', 'homebrew', 'nvm', 'npm', 'alias.ls']);
    })
  })
})
