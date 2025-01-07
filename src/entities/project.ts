import { ValidateResponseData } from 'codify-schemas';

import { PluginValidationError, PluginValidationErrorParams, TypeNotFoundError } from '../common/errors.js';
import { ctx } from '../events/context.js';
import { SourceMapCache } from '../parser/source-maps.js';
import { DependencyMap } from '../plugins/plugin-manager.js';
import { DependencyGraphResolver } from '../utils/dependency-graph-resolver.js';
import { groupBy } from '../utils/index.js';
import { ConfigBlock, ConfigType } from './config.js';
import { PlanRequest } from './plan-request.js';
import { ProjectConfig } from './project-config.js';
import { ResourceConfig } from './resource-config.js';

export class Project {
  projectConfig: ProjectConfig | null;
  resourceConfigs: ResourceConfig[];
  stateConfigs: ResourceConfig[] | null = null;
  evaluationOrder: null | string[] = null;
  path: string;

  sourceMaps?: SourceMapCache;
  planRequestsCache?: Map<string, PlanRequest>

  isDestroyProject = false;

  static create(configs: ConfigBlock[], path: string, sourceMaps?: SourceMapCache): Project {
    const projectConfigs = configs.filter((u) => u.configClass === ConfigType.PROJECT);
    if (projectConfigs.length > 1) {
      throw new Error(`Only one project config can be specified. Found ${projectConfigs.length}. \n\n
${JSON.stringify(projectConfigs, null, 2)}`);
    }

    return new Project(
      (projectConfigs[0] as ProjectConfig) ?? null,
      configs.filter((u) => u.configClass !== ConfigType.PROJECT) as ResourceConfig[],
      path,
      sourceMaps,
    );
  }

  constructor(projectConfig: ProjectConfig | null, resourceConfigs: ResourceConfig[], path: string, sourceMaps?: SourceMapCache) {
    this.projectConfig = projectConfig;
    this.resourceConfigs = resourceConfigs;
    this.sourceMaps = sourceMaps;
    this.path = path;

    this.addUniqueNamesForDuplicateResources()
  }

  isEmpty(): boolean {
    return this.resourceConfigs.length === 0;
  }

  isStateful(): boolean {
    return this.stateConfigs !== null && this.stateConfigs !== undefined && this.stateConfigs.length > 0;
  }

  filter(ids: string[]): Project {
    this.resourceConfigs = this.resourceConfigs.filter((r) => ids.find((id) => r.id.includes(id)));
    this.stateConfigs = this.stateConfigs?.filter((s) => ids.includes(s.id)) ?? null;

    return this;
  }

  add(...configs: ResourceConfig[]): Project {
    this.resourceConfigs.push(...configs);

    return this;
  }

  getPlanRequest(id: string): PlanRequest | undefined {
    // One time build a cache for plan requests to make it more efficient
    if (!this.planRequestsCache) {
      const { resourceConfigs } = this
      const stateOnlyConfigs = this.stateConfigs?.filter((s) =>
        !resourceConfigs.some((r) => r.id === s.id)
      )

      const inputRequests = [
        ...this.resourceConfigs.map((r) => [
            r.id, new PlanRequest(
              this.isStateful(), r, this.stateConfigs?.find((r) => r.id)
            )
          ] as const),
        ...(stateOnlyConfigs?.map((s) => [
            s.id, new PlanRequest(this.isStateful(), undefined, s)
          ] as const) ?? [])
      ]

      this.planRequestsCache = new Map(inputRequests)
    }

    return this.planRequestsCache.get(id);
  }

  toDestroyProject(): Project {
    const uninstallProject = new Project(
      this.projectConfig,
      this.resourceConfigs,
      this.sourceMaps,
    )

    uninstallProject.stateConfigs = uninstallProject.resourceConfigs;
    uninstallProject.resourceConfigs = [];
    this.isDestroyProject = true;

    return uninstallProject;
  }

  findResource(type: string, name?: string): ResourceConfig | null {
    return this.resourceConfigs.find((r) => r.isSame(type, name)) ?? null;
  }

  addXCodeToolsConfig() {
    this.resourceConfigs.unshift(new ResourceConfig({
      type: 'xcode-tools'
    }));
  }

  validateTypeIds(resourceMap: Map<string, string[]>) {
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
      r.addDependencies(dependencyMap.get(r.type)
        ?.filter((type) => [...resourceMap.values()].some((r) => r.type === type))
        ?.flatMap((type) => [...resourceMap.values()].filter((r) => r.type === type).map((r) => r.id)) ?? []
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
    const resourceOrder = DependencyGraphResolver.calculateDependencyList(
      this.resourceConfigs,
      (r) => r.id,
      (r) => r.dependencyIds
    );

    this.evaluationOrder = resourceOrder;

    if (!this.isStateful()) {
      ctx.debug(`Resource Evaluation Order:\n${this.evaluationOrder.join(',\n')}`);
      return;
    }

    const stateOrder = DependencyGraphResolver.calculateDependencyList(
      this.stateConfigs!,
      (r) => r.id,
      (r) => r.dependencyIds
    );

    const stateOnly = stateOrder.filter((s) => !resourceOrder.includes(s))
    this.evaluationOrder.push(...stateOnly);

    ctx.debug(`Resource Evaluation Order:\n${this.evaluationOrder.join(',\n')}`);
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
