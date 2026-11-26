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
import { NoticeConfig } from './notice-config.js';
import { type Plan } from './plan.js';
import { ProjectConfig } from './project-config.js';
import { ResourceConfig, ResourceOrigin } from './resource-config.js';
import { TemplateConfig } from './template-config.js';
import { VariableConfig } from './variable-config.js';

export class Project {
  projectConfig: ProjectConfig | null;
  resourceConfigs: ResourceConfig[];
  // Template declarations in the project file. They are expanded into resourceConfigs by the TemplateExpander.
  templateConfigs: TemplateConfig[] = [];
  // Variable declarations in the project file. Variables of templates are not added here (they are scoped to the template)
  variableConfigs: VariableConfig[] = [];
  // Notices of the project file and, once the templates are expanded, of every template (in declaration order)
  noticeConfigs: NoticeConfig[] = [];
  // Resource, template, variable and notice declarations in the order they were declared. Needed to resolve variables
  // and to expand templates in place.
  declarations: Array<NoticeConfig | ResourceConfig | TemplateConfig | VariableConfig> = [];
  // Ids of the resources that were removed because they don't apply (os, distro or when). Notices can reference them.
  removedResourceIds = new Set<string>();
  // Qualified names of the variables that are referenced (${{ name }}) but not declared. Shown as a warning.
  implicitVariables: string[] = [];
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
    project.variableConfigs = configs.filter((u) => u.configClass === ConfigType.VARIABLE) as VariableConfig[];
    project.noticeConfigs = configs.filter((u) => u.configClass === ConfigType.NOTICE) as NoticeConfig[];
    project.declarations = configs.filter((u) =>
      u.configClass === ConfigType.RESOURCE
      || u.configClass === ConfigType.TEMPLATE
      || u.configClass === ConfigType.VARIABLE
      || u.configClass === ConfigType.NOTICE
    ) as Array<NoticeConfig | ResourceConfig | TemplateConfig | VariableConfig>;

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

  /**
   * Removes the resources whose `when` condition doesn't match (resolved by the VariableResolver). dependsOn references
   * to them are removed like for the os filter, so that resources can depend on resources of another branch.
   * @param removedResourceIds resources that were removed because of their condition
   * @param removedTemplateIds template declarations that were not expanded because of their condition
   */
  removeConditionalDeclarations(removedResourceIds: string[], removedTemplateIds: string[]): void {
    // Templates that were not expanded still exist: references to them resolve to nothing
    for (const id of removedTemplateIds) {
      this.templateIds.add(id);
    }

    if (removedResourceIds.length === 0) {
      return;
    }

    for (const id of removedResourceIds) {
      this.removedResourceIds.add(id);
    }

    this.pruneDependsOnForRemovedResources(new Set([...this.resourceConfigs.map((r) => r.id), ...removedResourceIds]));
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

  /**
   * Adds a default config (ex: { type: 'homebrew' }) for every type that a resource requires but the project doesn't
   * declare, transitively (cursor requires homebrew, which requires xcode-tools). Must run before
   * {@link resolveDependenciesAndCalculateEvalOrder}: required resources become dependencies of the resources that need
   * them. Returns the added resources.
   */
  addRequiredResources(resourceDefinitions: ResourceDefinitionMap): ResourceConfig[] {
    const presentTypes = new Set(this.resourceConfigs.map((r) => r.type));
    const added: ResourceConfig[] = [];
    const queue = [...this.resourceConfigs];

    while (queue.length > 0) {
      const resource = queue.shift()!;

      const missingTypes = requiredTypes(resource.type, resourceDefinitions).filter((type) => !presentTypes.has(type));
      for (const type of missingTypes) {
        const required = new ResourceConfig({ type });
        presentTypes.add(type);
        added.push(required);
        queue.push(required);
        ctx.debug(`Adding "${type}" because it is required by "${resource.id}"`);
      }
    }

    // Prerequisites of prerequisites go first (xcode-tools before homebrew) so the stable sort keeps them in that order.
    this.resourceConfigs.unshift(...[...added].reverse());
    return added;
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
    this.noticeConfigs = this.noticeConfigs.filter((n) =>
      (!n.os || n.os.includes(currentOs)) && this.filterOrigins(n, (template) => !template.os || template.os.includes(currentOs))
    );
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
    this.noticeConfigs = this.noticeConfigs.filter((n) =>
      matchesDistro(n.distro) && this.filterOrigins(n, (template) => matchesDistro(template.distro))
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
   * The ids of the resources a dependsOn reference of a notice points to (same references as the dependsOn of a
   * resource). Empty if the reference was declared but doesn't apply here (os, distro or when). Null if nothing with
   * that id, type or name was declared.
   */
  resolveNoticeReference(ref: string): null | string[] {
    const resourceMap = new Map(this.resourceConfigs.map((r) => [r.id, r] as const));
    try {
      const ids = this.getMatchingResourceIds(resourceMap, ref);
      if (ids !== null) {
        return ids;
      }
    } catch {
      // Not found among the remaining resources
    }

    const removed = [...this.removedResourceIds].some((id) => id === ref || id.startsWith(`${ref}.`) || id.endsWith(`.${ref}`));
    return removed ? [] : null;
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
      // Required types are added by addRequiredResources(), so they are present here unless their plugin isn't loaded.
      const dependencyTypes = new Set([
        ...resourceDefinitions?.get(r.type)?.dependencies ?? [],
        ...(resourceDefinitions ? requiredTypes(r.type, resourceDefinitions) : []),
      ]);
      r.addDependencies([...resourceMap.values()]
        .filter((other) => other.id !== r.id && dependencyTypes.has(other.type))
        .map((other) => other.id)
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
  private filterOrigins(r: NoticeConfig | ResourceConfig, predicate: (template: ResourceOrigin['templates'][number]) => boolean): boolean {
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

    for (const id of removedIds) {
      this.removedResourceIds.add(id);
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

/**
 * Types that must exist for a resource of this type to work (ResourceSettings.requires in plugin-core). Plugins built
 * before plugin-core 2.1 don't send requires: on macOS their resources keep the previous behaviour of always requiring
 * xcode-tools.
 */
function requiredTypes(type: string, resourceDefinitions: ResourceDefinitionMap): string[] {
  const definition = resourceDefinitions.get(type) as (undefined | { requires?: string[] });
  if (!definition) {
    return [];
  }

  const requires = definition.requires
    ?? (OsUtils.isMacOS() ? ['xcode-tools'] : []);

  return [...new Set(requires)].filter((t) => t !== type && resourceDefinitions.has(t));
}
