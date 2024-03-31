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
        if (--parentNode.indegree) {
          queue.push(parentNode);
        }
      });
      result.push(node);
    }

    // const { resourceConfigs } = project;
    // const resourceMap = new Map<string, ResourceConfig>(
    //   resourceConfigs.map((r) => [r.id, r] as const)
    // );
    //
    // const resourceReferenceRegex = /\${([\w.]+)}/g
    //
    // // TODO: Support named resources in the future
    //
    // for (const config of resourceConfigs) {
    //   const referenceParameters = findParametersWithReferences(new Map(Object.entries(config.parameters)))
    //
    //   for (const [name, match] of referenceParameters) {
    //     const parts = match.split('.');
    //     if (parts.length < 2) {
    //       throw new Error(`Only resource parameter references are allowed. ${match}`);
    //     }
    //
    //     const referencedId = findId(parts);
    //     if (!referencedId) {
    //       throw new Error(`Unable to find resource being referenced. ${match}`);
    //     }
    //
    //     const referencedResource = resourceMap.get(referencedId)
    //     if (!referencedResource) {
    //       throw new Error(`Unable to find resource being referenced. ${match}`);
    //     }
    //
    //     const referencedParameterName = findParameterName(parts, referencedId);
    //     const referencedParameter = referencedResource.parameters.get(referencedParameterName);
    //     if (!referencedParameter) {
    //       throw new Error(`Un-able to find parameter being referenced. ${match}`);
    //     }
    //
    //     // TODO: Add recursive check for parameters of type parameter
    //
    //     config.dependencies.push(referencedResource);
    //
    //     // Substitute with actual value
    //     config.parameters.set(name,
    //       String(config.parameters.get(name)).replace(`\${${match}}`, String(referencedParameter))
    //     );
    //   }

    return result.map((n) => n.val);
  }

  // function findParametersWithReferences(parameters: Record<string, unknown>) {
  //   return [...parameters.entries()]
  //     .map(([name, value]) => [name, String(value), String(value).matchAll(resourceReferenceRegex)] as const)
  //     .filter(([, _, match]) => match)
  //     .flatMap(([name, _, matches]) =>
  //       [...matches].map(match => [name, match[1]] as const)
  //     );
  // }
  //
  // function findId(parts: string[]): null | string {
  //   if (applyableGraph.has(parts[0])) {
  //     return parts[0];
  //   }
  //
  //   if (applyableGraph.has(parts[0] + '.' + parts[1])) {
  //     return parts[0] + '.' + parts[1];
  //   }
  //
  //   return null;
  // }
  //
  // function findParameterName(parts: string[], id: string): string {
  //   return id.split('.').length === 1 ? parts[1] : parts[2];
  // }
  // };

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
