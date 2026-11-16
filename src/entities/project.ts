import { OS, PlanRequestData, ResourceOperation, ValidateResponseData } from '@codifycli/schemas';
import * as os from 'node:os'

import {
  LinuxDistroNotSupportedError,
  OperatingSystemNotSupportedError,
  PluginValidationError,
  PluginValidationErrorParams,
  TypeNotFoundError
} from '../common/errors.js';
import { ctx } from '../events/context.js';
import { type CodifySource, CodifySourceType } from '../parser/entities.js';
import { SourceMapCache } from '../parser/source-maps.js';
import { ResourceDefinitionMap } from '../plugins/plugin-manager.js';
import { DependencyGraphResolver } from '../utils/dependency-graph-resolver.js';
import { groupBy } from '../utils/index.js';
import { OsUtils } from '../utils/os-utils.js';
import { ConfigBlock, ConfigType } from './config.js';
import { type Plan } from './plan.js';
import { ProjectConfig } from './project-config.js';
import { ResourceConfig, ResourceOrigin } from './resource-config.js';
import { TemplateConfig } from './template-config.js';

export class Project {
  projectConfig: ProjectConfig | null;
  resourceConfigs: ResourceConfig[];
  // Template declarations in the project file. They are expanded into resourceConfigs by the TemplateExpander.
  templateConfigs: TemplateConfig[] = [];
  // Resource and template declarations in the order they were declared. Only needed to expand templates in place.
  declarations: Array<ResourceConfig | TemplateConfig> = [];
  templatesExpanded = false;
  // Ids of every template declaration (including nested ones). Set by the TemplateExpander.
  templateIds = new Set<string>();
  stateConfigs: ResourceConfig[] | null = null;
  evaluationOrder: null | string[] = null;

  codifyFiles: string[];
  // Where this project was loaded from. Null for projects built in memory (empty projects, json configs, etc.)
  source: CodifySource | null = null;

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

    const project = new Project(
      (projectConfigs[0] as ProjectConfig) ?? null,
      configs.filter((u) => u.configClass === ConfigType.RESOURCE) as ResourceConfig[],
      codifyFiles,
      sourceMaps,
    );

    project.templateConfigs = configs.filter((u) => u.configClass === ConfigType.TEMPLATE) as TemplateConfig[];
    project.declarations = configs.filter((u) =>
      u.configClass === ConfigType.RESOURCE || u.configClass === ConfigType.TEMPLATE
    ) as Array<ResourceConfig | TemplateConfig>;

    return project;
  }

  constructor(projectConfig: ProjectConfig | null, resourceConfigs: ResourceConfig[], codifyFiles: string[], sourceMaps?: SourceMapCache) {
    this.projectConfig = projectConfig;
    this.resourceConfigs = resourceConfigs;
    this.sourceMaps = sourceMaps;
    this.codifyFiles = codifyFiles;

    this.addUniqueNamesForDuplicateResources()
  }

  hasTemplates(): boolean {
    return this.templateConfigs.length > 0;
  }

  /** Replaces the declared resources with the expanded list (project resources + the resources of every template). */
  setExpandedResources(resourceConfigs: ResourceConfig[]): void {
    this.resourceConfigs = resourceConfigs;
    this.planRequestsCache = undefined;
    this.templatesExpanded = true;
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

  isRemote(): boolean {
    return this.source?.type === CodifySourceType.REMOTE;
  }

  isTemplate(): boolean {
    return this.source?.type === CodifySourceType.TEMPLATE;
  }

  get templateName(): string | undefined {
    return this.source?.type === CodifySourceType.TEMPLATE ? this.source.template.name : undefined;
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

    uninstallProject.source = this.source;
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
      const currentDistro = await OsUtils.getLinuxDistro();
      if (!currentDistro) {
        throw new Error('Unable to determine Linux distribution');
      }

      const distroInvalidConfigs = this.resourceConfigs.filter((c) => {
        const distros = resourceDefinitions.get(c.type)?.linuxDistros;
        if (!distros) {
          return false;
        }

        return !distros.includes(currentDistro);
      });

      if (distroInvalidConfigs.length > 0) {
        throw new LinuxDistroNotSupportedError(distroInvalidConfigs, this.sourceMaps);
      }
    }
  }

  removeResourcesUsingOsFilter() {
    const before = new Set(this.resourceConfigs.map((r) => r.id));
    const currentOs = OsUtils.getOs();

    this.resourceConfigs = this.resourceConfigs.filter((r) => {
      if (r.os && !r.os.includes(currentOs)) {
        return false;
      }

      // os declared on a template applies to every resource inside it. Keep the resource if any of the ways it was
      // included still applies.
      return this.filterOrigins(r, (template) => !template.os || template.os.includes(currentOs));
    });
    this.pruneDependsOnForRemovedResources(before);
  }

  async removeResourcesUsingDistroFilter() {
    if (!OsUtils.isLinux()) {
      return;
    }

    const currentDistro = await OsUtils.getLinuxDistro();
    if (!currentDistro) {
      return;
    }

    const before = new Set(this.resourceConfigs.map((r) => r.id));
    const matchesDistro = (distro?: string[]) => !distro
      || distro.length === 0
      || distro.some((d) => OsUtils.distroMatchesCurrent(d as never, currentDistro));

    this.resourceConfigs = this.resourceConfigs.filter((r) =>
      matchesDistro(r.distro) && this.filterOrigins(r, (template) => matchesDistro(template.distro))
    );
    this.pruneDependsOnForRemovedResources(before);
  }

  /**
   * Resolves which resources were included through a template declaration. Matches the template id
   * (template.<name>), the template type (template) or the template name.
   */
  getTemplateResourceIds(idOrTypeOrName: string): string[] {
    const matches = (o: ResourceOrigin) => o.templates.some((t) =>
      t.id === idOrTypeOrName || (idOrTypeOrName === ConfigType.TEMPLATE) || (t.name !== undefined && t.name === idOrTypeOrName)
    );

    return this.resourceConfigs
      .filter((r) => r.origins.some((o) => matches(o)))
      .map((r) => r.id);
  }

  /**
   * Gives resources that share an id (same type and no name) unique numeric names, in declaration order. Resources
   * that share an explicit name can't be told apart and throw.
   */
  assignUniqueNamesForDuplicateResources() {
    this.addUniqueNamesForDuplicateResources();
    this.planRequestsCache = undefined;
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
      r.addDependenciesFromDependsOn((idOrType) => this.getMatchingResourceIds(resourceMap, idOrType));
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

  // Keeps only the origins whose template declarations all pass the predicate. Returns false if none are left.
  private filterOrigins(r: ResourceConfig, predicate: (template: ResourceOrigin['templates'][number]) => boolean): boolean {
    r.origins = r.origins.filter((o) => o.templates.every((t) => predicate(t)));
    return r.origins.length > 0;
  }

  private addUniqueNamesForDuplicateResources() {
    const groups = groupBy(this.resourceConfigs, (i) => i.id)
    const duplicates = Object.entries(groups).filter(([, arr]) => arr.length > 1);

    for (const [id, resourceConfigs] of duplicates) {
      if (resourceConfigs.some((r) => r.name)) {
        if (resourceConfigs.some((r) => r.isFromTemplate)) {
          const templates = [...new Set(resourceConfigs.flatMap((r) => r.origins.flatMap((o) => o.templates.map((t) => t.source))))];
          throw new Error(`Duplicate name found for resource: ${id}. The resource is declared more than once with the same name (including in template${templates.length > 1 ? 's' : ''} ${templates.join(', ')}) but the declarations are not the same resource. Rename one of them.`);
        }

        throw new Error(`Duplicate name found for resource: ${id}`);
      }

      for (const [idx, r] of resourceConfigs.entries()) {
        r.setName(String(idx))
      }
    }
  }

  // Returns null if the reference doesn't exist. Returns an empty array if it exists but there is nothing to depend on.
  private getMatchingResourceIds(
    resourceMap: Map<string, ResourceConfig>,
    idOrType: string
  ): null | string[] {
    // References to a template declaration resolve to all of the resources included through it
    if (idOrType === ConfigType.TEMPLATE || idOrType.startsWith(`${ConfigType.TEMPLATE}.`)) {
      const templateResourceIds = this.getTemplateResourceIds(idOrType);
      if (templateResourceIds.length === 0 && !this.isTemplateDeclared(idOrType)) {
        throw new Error(`dependsOn reference "${idOrType}" was not found`);
      }

      return templateResourceIds;
    }

    // Fully qualified ID (type.name): must match exactly or throw
    if (idOrType.includes('.')) {
      if (!resourceMap.has(idOrType)) {
        throw new Error(`dependsOn reference "${idOrType}" was not found`);
      }
      return [idOrType];
    }

    // Type match: all resources of that type
    const byType = [...resourceMap.values()].filter((r) => r.type === idOrType);
    if (byType.length > 0) {
      return byType.map((r) => r.id);
    }

    // Name match: all resources with that name, plus the resources of templates with that name
    const byName = [...resourceMap.values()].filter((r) => r.name === idOrType).map((r) => r.id);
    const byTemplateName = this.getTemplateResourceIds(idOrType).filter((id) => !byName.includes(id));
    if (byName.length === 0 && byTemplateName.length === 0) {
      // A template with that name exists but none of its resources apply (e.g. filtered out by os)
      return this.isTemplateDeclared(`${ConfigType.TEMPLATE}.${idOrType}`) ? [] : null;
    }

    return [...byName, ...byTemplateName];
  }

  private isTemplateDeclared(id: string): boolean {
    if (id === ConfigType.TEMPLATE) {
      return this.templateIds.size > 0 || this.templateConfigs.length > 0;
    }

    return this.templateIds.has(id) || this.templateConfigs.some((t) => t.id === id);
  }

  // After OS/distro filtering, remove dependsOn entries that pointed exclusively to
  // resources that were filtered out. This allows cross-OS dependsOn references
  // (e.g. depending on an apt resource from a docker resource) without errors.
  private pruneDependsOnForRemovedResources(idsBefore: Set<string>) {
    const remainingIds = new Set(this.resourceConfigs.map((r) => r.id));
    const removedIds = [...idsBefore].filter((id) => !remainingIds.has(id));
    if (removedIds.length === 0) {
      return;
    }

    const removedSet = new Set(removedIds);
    const remaining = this.resourceConfigs;

    const keepReference = (ref: string) => {
      // Template references resolve to whatever is left of the template, nothing to prune
      if (ref === ConfigType.TEMPLATE || ref.startsWith(`${ConfigType.TEMPLATE}.`)) {
        return true;
      }

      // Fully qualified (type.name): drop if that exact id was removed
      if (ref.includes('.')) {
        return !removedSet.has(ref);
      }
      // Type reference: drop only if no remaining resource has that type
      const anyRemainingOfType = remaining.some((rm) => rm.type === ref);
      if (removedIds.some((id) => id === ref || id.startsWith(`${ref}.`))) {
        return anyRemainingOfType;
      }
      // Name reference: drop only if no remaining resource has that name
      const anyRemainingWithName = remaining.some((rm) => rm.name === ref);
      if (removedIds.some((id) => id.endsWith(`.${ref}`))) {
        return anyRemainingWithName;
      }
      return true;
    };

    for (const r of remaining) {
      r.dependsOn = r.dependsOn.filter((ref) => keepReference(ref));
      r.inheritedDependsOn = r.inheritedDependsOn.filter((ref) => keepReference(ref));
    }
  }
}
