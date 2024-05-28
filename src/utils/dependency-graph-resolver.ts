class Node<T> {
  id: string;
  val: T;
  indegree: number;
  dependencies: Node<T>[];

  constructor(id: string, val: T) {
    this.id = id;
    this.val = val;
    this.indegree = 0;
    this.dependencies = [];
  }

}

export class DependencyGraphResolver {

  /**
   * @return a dependency graph in the form of an adjacency list
   */
  static calculateDependencyList<T>(vals: T[], getId: (t: T) => string, getDependencyIds: (t: T) => string[]): T[] {
    if (vals.length === 0) {
      return [];
    }

    const nodes = vals.map((r) => new Node(getId(r), r));
    const nodeMap = new Map(nodes.map((n) => [n.id, n] as const));

    this.populateNodeDependencies(nodeMap, getDependencyIds);
    this.populateNodeIndegrees(nodeMap);

    const zeroIndegressNodes = nodes.filter((n) => n.indegree === 0);
    if (zeroIndegressNodes.length === 0) {
      throw new Error('Cyclic dependency found in configs. No resources is found that is not referenced');
    }

    const queue: Node<T>[] = [];
    const result: Node<T>[] = [];

    queue.push(...zeroIndegressNodes);
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) {
        throw new Error('Internal error: Undefined node found while resolving dependency graph');
      }

      node.dependencies.forEach((parentNode) => {
        if (--parentNode.indegree === 0) {
          queue.push(parentNode);
        }
      });
      result.unshift(node);
    }

    if (result.length !== vals.length) {
      const cyclicItems = vals.filter((n) => !result.some((r) => r.id === getId(n)));
      throw new Error(`Cyclic dependency found in configs. Ids: [${cyclicItems.map((i) => getId(i)).join(', ')}]`);
    }

    return result.map((n) => n.val);
  }

  private static populateNodeDependencies<T>(nodeMap: Map<string, Node<T>>, getDependencyIds: (t: T) => string[]) {
    [...nodeMap.values()].forEach((n) => {
      const dependencies = getDependencyIds(n.val)
        .map((id) => {
          const node = nodeMap.get(id);
          if (!node) {
            throw new Error(`Internal error: Node of id ${id} does not exist when resolving dependency graph`);
          }

          return node;
        });

      n.dependencies.push(...dependencies);
    })
  }

  private static populateNodeIndegrees<T>(nodeMap: Map<string, Node<T>>) {
    for (const node of nodeMap.values()) {
      for (const dependentNode of node.dependencies) {
        dependentNode.indegree++;
      }
    }
  }
}
