import { OS, PlanRequestData, ResourceOperation, ValidateResponseData } from '@codifycli/schemas';
import * as os from 'node:os'
import { validate } from 'uuid'

import {
  LinuxDistroNotSupportedError,
  OperatingSystemNotSupportedError,
  PluginValidationError,
  PluginValidationErrorParams,
  TypeNotFoundError
} from '../common/errors.js';
import { ctx } from '../events/context.js';
import { SourceMapCache } from '../parser/source-maps.js';
import { ResourceDefinitionMap } from '../plugins/plugin-manager.js';
import { DependencyGraphResolver } from '../utils/dependency-graph-resolver.js';
import { groupBy } from '../utils/index.js';
import { OsUtils } from '../utils/os-utils.js';
import { ShellUtils } from '../utils/shell.js';
import { ConfigBlock, ConfigType } from './config.js';
import { type Plan } from './plan.js';
import { ProjectConfig } from './project-config.js';
import { ResourceConfig } from './resource-config.js';

export class Project {
  projectConfig: ProjectConfig | null;
  resourceConfigs: ResourceConfig[];
  stateConfigs: ResourceConfig[] | null = null;
  evaluationOrder: null | string[] = null;

  codifyFiles: string[];

  sourceMaps?: SourceMapCache;
  planRequestsCache?: Map<string, PlanRequestData>

  isDestroyProject = false;

  static empty(): Project {
    return Project.create([], []);
  }

  static create(configs: ConfigBlock[], codifyFiles: string[], sourceMaps?: SourceMapCache): Project {
    const projectConfigs = configs.filter((u) => u.configClass === ConfigType.PROJECT);
    if (projectConfigs.length > 1) {
      throw new Error(`Only one project config can be specified. Found ${projectConfigs.length}. \n\n
${JSON.stringify(projectConfigs, null, 2)}`);
    }

    return new Project(
      (projectConfigs[0] as ProjectConfig) ?? null,
      configs.filter((u) => u.configClass !== ConfigType.PROJECT) as ResourceConfig[],
      codifyFiles,
      sourceMaps,
    );
  }

  constructor(projectConfig: ProjectConfig | null, resourceConfigs: ResourceConfig[], codifyFiles: string[], sourceMaps?: SourceMapCache) {
    this.projectConfig = projectConfig;
    this.resourceConfigs = resourceConfigs;
    this.sourceMaps = sourceMaps;
    this.codifyFiles = codifyFiles;

    this.addUniqueNamesForDuplicateResources()
  }

  isEmpty(): boolean {
    return this.resourceConfigs.length === 0;
  }

  exists(): boolean {
    return this.codifyFiles.length > 0;
  }

  isStateful(): boolean {
    return this.stateConfigs !== null && this.stateConfigs !== undefined && this.stateConfigs.length > 0;
  }

  // TODO: Update to a more robust method in the future
  isCloud(): boolean {
    return validate(this.codifyFiles[0])
  }

  filterInPlace(ids: string[]): Project {
    this.resourceConfigs = this.resourceConfigs.filter((r) => ids.find((id) => r.id.includes(id)));
    this.stateConfigs = this.stateConfigs?.filter((s) => ids.includes(s.id)) ?? null;

    return this;
  }

  add(...configs: ResourceConfig[]): Project {
    this.resourceConfigs.push(...configs);

    return this;
  }

  getPlanRequest(id: string): PlanRequestData | undefined {
    // One time build a cache for plan requests to make it more efficient
    if (!this.planRequestsCache) {
      const { resourceConfigs, stateConfigs } = this
      const stateOnlyConfigs = stateConfigs?.filter((s) =>
        !resourceConfigs.some((r) => r.id === s.id)
      )

      const inputRequests = [
        ...resourceConfigs.map((r) => [
            r.id,
            <PlanRequestData>{
              isStateful: this.isStateful(),
              core: r.toJson().core,
              desired: r.toJson().parameters,
              state: stateConfigs?.find((r) => r.id)?.parameters
            }
          ] as const),
        ...(stateOnlyConfigs?.map((s) => [
            s.id,
            <PlanRequestData>{
              isStateful: this.isStateful(),
              core: s.toJson().core,
              desired: undefined,
              state: s.toJson().parameters,
            }
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
      this.codifyFiles,
      this.sourceMaps,
    )

    uninstallProject.stateConfigs = uninstallProject.resourceConfigs;
    uninstallProject.resourceConfigs = [];
    this.isDestroyProject = true;

    return uninstallProject;
  }

  findAll(type: string, name?: string): ResourceConfig[] {
    return this.resourceConfigs.filter((r) =>
      name
        ? r.isSame(type, name)
        : r.type === type
    );
  }

  findSpecific(type: string, name?: string): ResourceConfig | null {
    return this.resourceConfigs.find((r) => r.isSame(type, name)) ?? null;
  }

  addXCodeToolsConfig() {
    this.resourceConfigs.unshift(new ResourceConfig({
      type: 'xcode-tools'
    }));

    if (this.evaluationOrder) {
      this.evaluationOrder.unshift('xcode-tools');
    }
  }

  validateTypeIds(resourceDefinitions: ResourceDefinitionMap) {
    const invalidConfigs = this.resourceConfigs.filter((c) => !resourceDefinitions.has(c.type));

    if (invalidConfigs.length > 0) {
      throw new TypeNotFoundError(invalidConfigs, this.sourceMaps);
    }
  }

  async validateOsAndDistro(resourceDefinitions: ResourceDefinitionMap) {
    const invalidConfigs = this.resourceConfigs.filter((c) => {
      const operatingSystems = resourceDefinitions.get(c.type)?.operatingSystems;
      if (!operatingSystems) {
        return false;
      }

      return !operatingSystems.includes(os.type() as OS);
    });

    if (invalidConfigs.length > 0) {
      throw new OperatingSystemNotSupportedError(invalidConfigs, this.sourceMaps);
    }

    if (os.type() === OS.Linux) {
      const currentDistro = await ShellUtils.getLinuxDistro();
      if (!currentDistro) {
        throw new Error('Unable to determine Linux distribution');
      }

      this.resourceConfigs.filter((c) => {
        const distros = resourceDefinitions.get(c.type)?.linuxDistros;
        if (!distros) {
          return false;
        }

        return !distros.includes(currentDistro);
      });

      if (invalidConfigs.length > 0) {
        throw new LinuxDistroNotSupportedError(invalidConfigs, this.sourceMaps);
      }
    }
  }

  removeResourcesUsingOsFilter() {
    this.resourceConfigs = this.resourceConfigs.filter((r) => {
      if (!r.os) {
        return true;
      }

      return r.os.includes(OsUtils.getOs());
   });
  }

  resolveDependenciesAndCalculateEvalOrder(resourceDefinitions?: ResourceDefinitionMap) {
    this.resolveResourceDependencies(resourceDefinitions);
    this.calculateEvaluationOrder();
  }

  handlePluginResourceValidationResults(results: ValidateResponseData[]) {
    const resultsFlattened = results.flatMap((r) => r.resourceValidations);

    const invalidResults = resultsFlattened.filter((r) => !r.isValid);
    if (invalidResults.length > 0) {
      const resourceErrors: PluginValidationErrorParams = invalidResults.map((r,) => ({
        customErrorMessage: r.customValidationErrorMessage,
        resource: this.findSpecific(r.resourceType, r.resourceName)!,
        schemaErrors: r.schemaValidationErrors,
      }))

      throw new PluginValidationError(resourceErrors, this.sourceMaps);
    }
  }

  removeNoopFromEvaluationOrder(plan: Plan) {
    this.evaluationOrder = this.evaluationOrder?.filter((id) =>
      plan.getResourcePlan(id)?.operation !== ResourceOperation.NOOP,
    ) ?? null;
  }

  private resolveResourceDependencies(resourceDefinitions?: ResourceDefinitionMap) {
    const resourceMap = new Map(this.resourceConfigs.map((r) => [r.id, r] as const));

    for (const r of this.resourceConfigs) {
      // User specified dependencies are hard dependencies. They must be present.
      r.addDependenciesFromDependsOn((id) => resourceMap.has(id));
      r.addDependenciesBasedOnParameters((id) => resourceMap.has(id));

      // Plugin dependencies are soft dependencies. They only activate if the dependent resource is present.
      r.addDependencies(resourceDefinitions?.get(r.type)?.dependencies
        ?.filter((type) => [...resourceMap.values()].some((r) => r.type === type))
        ?.flatMap((type) => [...resourceMap.values()].filter((r) => r.type === type).map((r) => r.id)) ?? []
      );
    }
  }

  private calculateEvaluationOrder() {
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
