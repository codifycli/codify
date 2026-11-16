class Node<T> {
  id: string;
  val: T;
  // Position in the input list. Used as the priority so that the declaration order is kept whenever possible.
  index: number;
  // Number of dependencies that have not been emitted yet
  remainingDependencies = 0;
  // Nodes that depend on this node
  dependents: Node<T>[] = [];

  constructor(id: string, val: T, index: number) {
    this.id = id;
    this.val = val;
    this.index = index;
  }
}

export class DependencyGraphResolver {

  /**
   * Topologically sorts the values so that every value comes after its dependencies.
   *
   * The sort is stable: values are emitted in their input (declaration) order unless a dependency requires a value to
   * be moved. This is Kahn's algorithm where the next node is always the ready node with the lowest input index.
   *
   * @return the ids of the values in evaluation order
   */
  static calculateDependencyList<T>(vals: T[], getId: (t: T) => string, getDependencyIds: (t: T) => string[]): string[] {
    if (vals.length === 0) {
      return [];
    }

    const nodes = vals.map((r, idx) => new Node(getId(r), r, idx));
    const nodeMap = new Map(nodes.map((n) => [n.id, n] as const));

    this.populateEdges(nodeMap, getDependencyIds);

    const ready = nodes.filter((n) => n.remainingDependencies === 0);
    if (ready.length === 0) {
      throw new Error('Cyclic dependency found in configs. No resources is found that is not referenced');
    }

    const result: Node<T>[] = [];
    while (ready.length > 0) {
      const next = this.popLowestIndex(ready);
      result.push(next);

      for (const dependent of next.dependents) {
        if (--dependent.remainingDependencies === 0) {
          ready.push(dependent);
        }
      }
    }

    if (result.length !== vals.length) {
      const cyclicItems = vals.filter((n) => !result.some((r) => r.id === getId(n)));
      throw new Error(`Cyclic dependency found in configs. Ids: [${cyclicItems.map((i) => getId(i)).join(', ')}]`);
    }

    return result.map((n) => n.id);
  }

  private static populateEdges<T>(nodeMap: Map<string, Node<T>>, getDependencyIds: (t: T) => string[]) {
    for (const node of nodeMap.values()) {
      // Duplicate dependency ids would otherwise be counted twice
      const dependencyIds = new Set(getDependencyIds(node.val));

      for (const id of dependencyIds) {
        const dependency = nodeMap.get(id);
        if (!dependency) {
          throw new Error(`Internal error: Node of id ${id} does not exist when resolving dependency graph`);
        }

        dependency.dependents.push(node);
        node.remainingDependencies++;
      }
    }
  }

  // The number of resources is small, a linear scan is fast enough and keeps this dependency free.
  private static popLowestIndex<T>(ready: Node<T>[]): Node<T> {
    let lowest = 0;
    for (let i = 1; i < ready.length; i++) {
      if (ready[i].index < ready[lowest].index) {
        lowest = i;
      }
    }

    return ready.splice(lowest, 1)[0];
  }
}
