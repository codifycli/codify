import { ValidateResponseData } from 'codify-schemas';

import { ctx } from '../events/context.js';
import { DependencyMap } from '../plugins/plugin-manager.js';
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

  addXCodeToolsConfig() {
    this.resourceConfigs.unshift(new ResourceConfig({
      type: 'xcode-tools'
    }));
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

    for (const r of this.resourceConfigs) {
      // User specified dependencies are hard dependencies. They must be present.
      r.addDependenciesBasedOnParameters((id) => resourceMap.has(id));

      // Plugin dependencies are soft dependencies. They only activate if the dependent resource is present.
      r.addDependencies(dependencyMap.get(r.id)
          ?.filter((id) => resourceMap.has(id))
        ?? []
      );

      // Add this to ensure that the default config xcode-tools gets applied first
      // TODO: remove this in the future with required dependencies
      if (r.type !== 'xcode-tools') {
        r.addDependencies(['xcode-tools'])
      }
    }
  }

  handlePluginResourceValidationResults(results: ValidateResponseData[]) {
    const resultsFlattened = results.flatMap((r) => r.validationResults);

    const isValid = resultsFlattened.every((r) => r.isValid);
    if (!isValid) {
      throw new Error(`Config definition errors: 
${JSON.stringify(
        resultsFlattened
          .filter((r) => !r.isValid),
        null,
        2
      )}
      `);
    }
  }

  calculateEvaluationOrder() {
    this.evaluationOrder = DependencyGraphResolver.calculateDependencyList(
      this.resourceConfigs,
      (r) => r.id,
      (r) => r.dependencyIds
    );

    ctx.debug(`Resource Evaluation Order:\n${JSON.stringify(this.evaluationOrder, null, 2)}`);
  }
}
