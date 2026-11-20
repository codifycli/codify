import { TemplateError } from '../common/errors.js';
import { ConfigBlock, ConfigType } from '../entities/config.js';
import { Project } from '../entities/project.js';
import { ProjectConfig } from '../entities/project-config.js';
import { ResourceConfig, ResourceOrigin, TemplateRef } from '../entities/resource-config.js';
import { TemplateConfig } from '../entities/template-config.js';
import { VariableConfig } from '../entities/variable-config.js';
import { ctx } from '../events/context.js';
import { InMemoryFile } from '../parser/entities.js';
import { CodifyParser } from '../parser/index.js';
import { SourceMapCache } from '../parser/source-maps.js';
import { VariableResolver, VariableScope } from '../variables/variable-resolver.js';
import { ApiTemplateLoader, TemplateLoader } from './template-loader.js';

interface ExpansionState {
  // sourceKeys of the templates currently being expanded (outermost first). Used to detect cycles.
  stack: string[];
  // Resources (including nested ones) of every template that has been fully expanded, keyed by sourceKey and the
  // values passed to its variables
  completed: Map<string, ResourceConfig[]>;
  // Loaded template files, keyed by sourceKey. A template included more than once is only fetched once.
  files: Map<string, InMemoryFile>;
  templateIds: Set<string>;
  sourceMaps: SourceMapCache;
  variables: VariableResolver;
  // Declarations that were removed because their when condition doesn't match
  removedResourceIds: string[];
  removedTemplateIds: string[];
  implicitVariables: string[];
}

/**
 * Replaces the template declarations of a project with the resources of each template, at the position the template
 * was declared. Templates can include other templates.
 *
 * - Every resource remembers how it was included (ResourceConfig.origins). The dependsOn, os and distro of a template
 *   declaration apply to every resource inside it.
 * - A template that was already expanded is not added again. Its resources gain an extra origin instead, so that the
 *   constraints of the new declaration apply as well.
 * - Cycles (a template that includes itself, directly or indirectly) are allowed. The repeated inclusion adds nothing
 *   since all of its resources are already part of the project.
 *
 * - Variables are resolved one file at a time (see VariableResolver): first the variables of the project file, then the
 *   templates whose when condition matches are expanded and their variables are asked. Variables of a template are
 *   scoped to the template. Templates whose condition doesn't match are never loaded.
 * - The same template included again with different values for its variables is expanded again.
 *
 * Duplicate resources (e.g. homebrew in both the project and a template) are merged later, once the plugins are
 * initialized (see TemplateResourceMerger).
 */
export class TemplateExpander {
  constructor(private readonly loader: TemplateLoader) {}

  /**
   * Resolves the variables of the project and expands its templates.
   * @param variables asks for the values of the variables. The default can't ask (fails if a value is needed).
   */
  async expand(project: Project, variables: VariableResolver = new VariableResolver()): Promise<void> {
    if (project.templatesExpanded) {
      return;
    }

    project.sourceMaps ??= new SourceMapCache();
    const state: ExpansionState = {
      stack: [],
      completed: new Map(),
      files: new Map(),
      templateIds: project.templateIds,
      sourceMaps: project.sourceMaps,
      variables,
      removedResourceIds: [],
      removedTemplateIds: [],
      implicitVariables: [],
    };

    const resources = await this.flatten(project.declarations, [], TemplateExpander.projectScope(project), state);
    for (const resource of resources) {
      if (resource.isFromTemplate) {
        resource.inheritedDependsOn = TemplateExpander.inheritedDependsOn(resource.origins);
      }
    }

    project.setExpandedResources(resources);
    project.removeConditionalDeclarations(state.removedResourceIds, state.removedTemplateIds);
    project.implicitVariables = state.implicitVariables;
    ctx.debug(`Expanded templates. Resources:\n${resources.map((r) => `${r.id} ${TemplateExpander.describeOrigins(r)}`).join('\n')}`);
  }

  /**
   * Resolves the variables of the project file without expanding templates (import and refresh). Template declarations
   * are kept as they are.
   */
  static async resolveProjectVariables(project: Project, variables: VariableResolver = new VariableResolver()): Promise<void> {
    const result = await variables.resolveScope(project.declarations, TemplateExpander.projectScope(project));

    project.resourceConfigs = result.declarations.filter((d): d is ResourceConfig => d instanceof ResourceConfig);
    project.planRequestsCache = undefined;
    project.removeConditionalDeclarations(result.removedResourceIds, result.removedTemplateIds);
    project.implicitVariables = result.implicitVariables;
  }

  private static projectScope(project: Project): VariableScope {
    return { labels: [], location: project.codifyFiles[0] ?? 'config' };
  }

  private async flatten(
    allDeclarations: Array<ResourceConfig | TemplateConfig | VariableConfig>,
    chain: TemplateRef[],
    scope: VariableScope,
    state: ExpansionState,
  ): Promise<ResourceConfig[]> {
    const result: ResourceConfig[] = [];

    const { declarations, removedResourceIds, removedTemplateIds, implicitVariables } = await state.variables.resolveScope(allDeclarations, scope);
    state.removedResourceIds.push(...removedResourceIds);
    state.removedTemplateIds.push(...removedTemplateIds);
    state.implicitVariables.push(...implicitVariables);

    // Labels of the templates of this file. Used to name the variables of each template (ex: astro-blog.projectName)
    const labels = TemplateExpander.templateLabels(declarations);

    for (const declaration of declarations) {
      if (declaration instanceof ResourceConfig) {
        if (chain.length > 0) {
          declaration.origins = [{ templates: chain }];
        }

        result.push(declaration);
        continue;
      }

      state.templateIds.add(declaration.id);
      const templateChain = [...chain, TemplateExpander.toRef(declaration)];
      const key = declaration.sourceKey;
      const instanceKey = TemplateExpander.instanceKey(declaration);

      if (state.stack.includes(key)) {
        ctx.debug(`Template ${declaration.source} includes itself (${[...state.stack, key].join(' > ')}). Skipping the repeated inclusion.`);
        continue;
      }

      const expanded = state.completed.get(instanceKey);
      if (expanded) {
        TemplateExpander.addOrigin(expanded, key, templateChain);
        continue;
      }

      const childScope: VariableScope = {
        labels: [...scope.labels, labels.get(declaration)!],
        location: `template ${declaration.source}`,
        passed: declaration.resolvedVariables,
        passedSensitive: declaration.resolvedSensitiveVariables,
      };

      state.stack.push(key);
      const children = await this.flatten(await this.loadDeclarations(declaration, state), templateChain, childScope, state);
      state.stack.pop();

      state.completed.set(instanceKey, children);
      result.push(...children);
    }

    return result;
  }

  private async loadDeclarations(template: TemplateConfig, state: ExpansionState): Promise<Array<ResourceConfig | TemplateConfig | VariableConfig>> {
    // Parsed again for every inclusion: the variables of each inclusion are applied to their own copy
    const file = state.files.get(template.sourceKey) ?? await this.loader.load(template);
    state.files.set(template.sourceKey, file);
    const blocks: ConfigBlock[] = CodifyParser.parseFile(file, state.sourceMaps);

    const projectConfig = blocks.find((b) => b.configClass === ConfigType.PROJECT) as ProjectConfig | undefined;
    if (projectConfig?.plugins && Object.keys(projectConfig.plugins).length > 0) {
      throw new TemplateError(template.source, `Templates can't declare plugins. Found: ${Object.keys(projectConfig.plugins).join(', ')}`);
    }

    // The project block of a template (description, etc.) does not apply to the project including it.
    return blocks.filter((b) => b.configClass !== ConfigType.PROJECT) as Array<ResourceConfig | TemplateConfig | VariableConfig>;
  }

  /** The template contents and the values passed to its variables. The same template with other values is expanded again. */
  private static instanceKey(template: TemplateConfig): string {
    const values = template.resolvedVariables ?? {};
    const sorted = Object.fromEntries(Object.keys(values).sort().map((k) => [k, values[k]]));
    return Object.keys(sorted).length > 0 ? `${template.sourceKey} ${JSON.stringify(sorted)}` : template.sourceKey;
  }

  /**
   * A label per template declaration: its name, or else the last part of its source (@codify/astro-blog -> astro-blog).
   * Templates of the same file with the same label get a numeric suffix (astro-blog, astro-blog-2).
   */
  private static templateLabels(declarations: Array<ResourceConfig | TemplateConfig>): Map<TemplateConfig, string> {
    const labels = new Map<TemplateConfig, string>();
    const counts = new Map<string, number>();

    for (const template of declarations.filter((d): d is TemplateConfig => d instanceof TemplateConfig)) {
      const base = template.name ?? template.source.split('/').at(-1)!;
      const count = (counts.get(base) ?? 0) + 1;
      counts.set(base, count);
      labels.set(template, count === 1 ? base : `${base}-${count}`);
    }

    return labels;
  }

  /**
   * A template that was already expanded is included again. Every resource of that template gains a new origin: the
   * new chain followed by the part of the existing chain that comes after the template.
   */
  private static addOrigin(resources: ResourceConfig[], sourceKey: string, chain: TemplateRef[]) {
    for (const resource of resources) {
      for (const origin of [...resource.origins]) {
        const idx = origin.templates.findIndex((t) => t.sourceKey === sourceKey);
        if (idx === -1) {
          continue;
        }

        const newOrigin: ResourceOrigin = { templates: [...chain, ...origin.templates.slice(idx + 1)] };
        const exists = resource.origins.some((o) => TemplateExpander.isSameOrigin(o, newOrigin));
        if (!exists) {
          resource.origins.push(newOrigin);
        }
      }
    }
  }

  static inheritedDependsOn(origins: ResourceOrigin[]): string[] {
    return [...new Set(origins.flatMap((o) => o.templates.flatMap((t) => t.dependsOn)))];
  }

  /** Human readable description of where a resource came from. Ex: (from template @codify/node > nvm) */
  static describeOrigins(resource: ResourceConfig): string {
    const templateOrigins = resource.origins.filter((o) => o.templates.length > 0);
    if (templateOrigins.length === 0) {
      return '';
    }

    const chains = templateOrigins.map((o) => o.templates.map((t) => t.source).join(' > '));
    return `(from template ${chains.join(', ')})`;
  }

  private static isSameOrigin(a: ResourceOrigin, b: ResourceOrigin): boolean {
    return a.templates.length === b.templates.length
      && a.templates.every((t, i) => t.id === b.templates[i].id && t.sourceKey === b.templates[i].sourceKey);
  }

  private static toRef(template: TemplateConfig): TemplateRef {
    return {
      id: template.id,
      name: template.name,
      source: template.source,
      sourceKey: template.sourceKey,
      dependsOn: template.dependsOn,
      os: template.os,
      distro: template.distro,
    };
  }
}

export const templateLoader = new ApiTemplateLoader();
export const templateExpander = new TemplateExpander(templateLoader);
