import { DependencyMap } from '../plugins/plugin-collection.js';
import { DependencyGraphResolver } from '../utils/dependency-graph-resolver.js';
import { ProjectConfig } from './project-config.js';
import { ResourceConfig } from './resource-config.js';

export class Project {
  projectConfig: ProjectConfig | null;
  resourceConfigs: ResourceConfig[];

  evaluationOrder: ResourceConfig[] = [];

  constructor(projectConfig: ProjectConfig | null, resourceConfigs: ResourceConfig[]) {
    this.projectConfig = projectConfig;
    this.resourceConfigs = resourceConfigs;
  }

  validateWithResourceMap(resourceMap: Map<string, string[]>) {
    const invalidConfigs = this.resourceConfigs.filter((c) => resourceMap.get(c.type));
    if (invalidConfigs.length > 0) {
      throw new Error(`Unknown types specified: ${JSON.stringify(invalidConfigs, null, 2)}`);
    }
  }

  resolveResourceDependencies(dependencyMap: DependencyMap) {
    const resourceMap = new Map(this.resourceConfigs.map((r) => [r.id, r] as const));

    this.resourceConfigs.forEach((r) => {
      r.parseDependenciesFromParameters((id) => resourceMap.has(id));
      r.addDependencies(dependencyMap.get(r.id) ?? []);
    })
  }

  calculateEvaluationOrder() {
    this.evaluationOrder = DependencyGraphResolver.calculateDependencyList(
      this.resourceConfigs,
      (r) => r.id,
      (r) => r.dependencyIds
    );
  }
}
