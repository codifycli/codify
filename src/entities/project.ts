import { ValidateResponseData } from 'codify-schemas';

import { PluginValidationError, PluginValidationErrorParams, TypeNotFoundError } from '../common/errors.js';
import { ctx } from '../events/context.js';
import { SourceMapCache } from '../parser/source-maps.js';
import { DependencyMap } from '../plugins/plugin-manager.js';
import { DependencyGraphResolver } from '../utils/dependency-graph-resolver.js';
import { groupBy } from '../utils/index.js';
import { ConfigBlock, ConfigType } from './config.js';
import { ProjectConfig } from './project-config.js';
import { ResourceConfig } from './resource-config.js';

export class Project {
  projectConfig: ProjectConfig | null;
  resourceConfigs: ResourceConfig[];
  evaluationOrder: ResourceConfig[] = [];
  sourceMaps?: SourceMapCache;

  static create(configs: ConfigBlock[], sourceMaps?: SourceMapCache): Project {
    const projectConfigs = configs.filter((u) => u.configClass === ConfigType.PROJECT);
    if (projectConfigs.length > 1) {
      throw new Error(`Only one project config can be specified. Found ${projectConfigs.length}. \n\n
${JSON.stringify(projectConfigs, null, 2)}`);
    }

    return new Project(
      (projectConfigs[0] as ProjectConfig) ?? null,
      configs.filter((u) => u.configClass !== ConfigType.PROJECT) as ResourceConfig[],
      sourceMaps,
    );
  }

  constructor(projectConfig: ProjectConfig | null, resourceConfigs: ResourceConfig[], sourceMaps?: SourceMapCache) {
    this.projectConfig = projectConfig;
    this.resourceConfigs = resourceConfigs;
    this.sourceMaps = sourceMaps;

    this.addUniqueNamesForDuplicateResources()
  }

  isEmpty(): boolean {
    return this.resourceConfigs.length === 0;
  }

  filter(types: string[]): Project {
    return new Project(
      this.projectConfig,
      this.resourceConfigs.filter((r) => types.includes(r.type)),
      this.sourceMaps,
    )
  }

  findResource(type: string, name?: string): ResourceConfig | null {
    return this.resourceConfigs.find((r) => r.isSame(type, name)) ?? null;
  }

  addXCodeToolsConfig() {
    this.resourceConfigs.unshift(new ResourceConfig({
      type: 'xcode-tools'
    }));
  }

  validateWithResourceMap(resourceMap: Map<string, string[]>) {
    const invalidConfigs = this.resourceConfigs.filter((c) => !resourceMap.get(c.type));

    if (invalidConfigs.length > 0) {
      throw new TypeNotFoundError(invalidConfigs, this.sourceMaps);
    }
  }

  resolveResourceDependencies(dependencyMap: DependencyMap) {
    const resourceMap = new Map(this.resourceConfigs.map((r) => [r.id, r] as const));

    for (const r of this.resourceConfigs) {
      // User specified dependencies are hard dependencies. They must be present.
      r.addDependenciesFromDependsOn((id) => resourceMap.has(id));
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
    const resultsFlattened = results.flatMap((r) => r.resourceValidations);

    const invalidResults = resultsFlattened.filter((r) => !r.isValid);
    if (invalidResults.length > 0) {
      const resourceErrors: PluginValidationErrorParams = invalidResults.map((r,) => ({
        customErrorMessage: r.customValidationErrorMessage,
        resource: this.findResource(r.resourceType, r.resourceName)!,
        schemaErrors: r.schemaValidationErrors,
      }))

      throw new PluginValidationError(resourceErrors, this.sourceMaps);
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

  private addUniqueNamesForDuplicateResources() {
    const groups = groupBy(this.resourceConfigs, (i) => i.id)
    const duplicates = Object.entries(groups).filter(([, arr]) => arr.length > 1);

    for (const [id, resourceConfigs] of duplicates) {
      if (resourceConfigs.some((r) => r.name)) {
        throw new Error(`Duplicate name found for resource: ${id}`);
      }

      for (const [idx, r] of resourceConfigs.entries()) {
        r.setName(String(idx))
      }
    }
  }
}
