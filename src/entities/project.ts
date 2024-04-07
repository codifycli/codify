import { ValidateResponseData } from 'codify-schemas';

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

  isEmpty(): boolean {
    return this.resourceConfigs.length === 0;
  }

  validateWithResourceMap(resourceMap: Map<string, string[]>) {
    const invalidConfigs = this.resourceConfigs.filter((c) => !resourceMap.get(c.type));
    if (invalidConfigs.length > 0) {
      const invalidTypes = invalidConfigs.map((c) => c.type)

      throw new Error(`Unknown type specified: ${invalidTypes.join(',\n')}`);
    }
  }

  resolveResourceDependencies(dependencyMap: DependencyMap) {
    const resourceMap = new Map(this.resourceConfigs.map((r) => [r.id, r] as const));

    this.resourceConfigs.forEach((r) => {
      r.parseDependenciesFromParameters((id) => resourceMap.has(id));
      r.addDependencies(dependencyMap.get(r.id) ?? []);
    })
  }

  handlePluginResourceValidationResults(results: ValidateResponseData[]) {
    const isValid = results.reduce((prev, curr) => prev && curr.isValid, true);
    if (!isValid) {
      const errors = results
        .filter((r) => (r.errors?.length ?? 0) > 0)
        .flat(1)
        .map((e) => JSON.stringify(e, null, 2))
        .join('\n\n');

      throw new Error(`Config definition errors: \n ${errors}`);
    }
  }

  calculateEvaluationOrder() {
    this.evaluationOrder = DependencyGraphResolver.calculateDependencyList(
      this.resourceConfigs,
      (r) => r.id,
      (r) => r.dependencyIds
    );
  }
}
