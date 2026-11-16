import { TemplateError } from '../common/errors.js';
import { ConfigBlock, ConfigType } from '../entities/config.js';
import { Project } from '../entities/project.js';
import { ProjectConfig } from '../entities/project-config.js';
import { ResourceConfig, ResourceOrigin, TemplateRef } from '../entities/resource-config.js';
import { TemplateConfig } from '../entities/template-config.js';
import { ctx } from '../events/context.js';
import { CodifyParser } from '../parser/index.js';
import { SourceMapCache } from '../parser/source-maps.js';
import { ApiTemplateLoader, TemplateLoader } from './template-loader.js';

interface ExpansionState {
  // sourceKeys of the templates currently being expanded (outermost first). Used to detect cycles.
  stack: string[];
  // Resources (including nested ones) of every template that has been fully expanded, keyed by sourceKey
  completed: Map<string, ResourceConfig[]>;
  templateIds: Set<string>;
  sourceMaps: SourceMapCache;
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
 * Duplicate resources (e.g. homebrew in both the project and a template) are merged later, once the plugins are
 * initialized (see TemplateResourceMerger).
 */
export class TemplateExpander {
  constructor(private readonly loader: TemplateLoader) {}

  async expand(project: Project): Promise<void> {
    if (!project.hasTemplates() || project.templatesExpanded) {
      return;
    }

    project.sourceMaps ??= new SourceMapCache();
    const state: ExpansionState = {
      stack: [],
      completed: new Map(),
      templateIds: project.templateIds,
      sourceMaps: project.sourceMaps,
    };

    const resources = await this.flatten(project.declarations, [], state);
    for (const resource of resources) {
      if (resource.isFromTemplate) {
        resource.inheritedDependsOn = TemplateExpander.inheritedDependsOn(resource.origins);
      }
    }

    project.setExpandedResources(resources);
    ctx.debug(`Expanded templates. Resources:\n${resources.map((r) => `${r.id} ${TemplateExpander.describeOrigins(r)}`).join('\n')}`);
  }

  private async flatten(
    declarations: Array<ResourceConfig | TemplateConfig>,
    chain: TemplateRef[],
    state: ExpansionState,
  ): Promise<ResourceConfig[]> {
    const result: ResourceConfig[] = [];

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

      if (state.stack.includes(key)) {
        ctx.debug(`Template ${declaration.source} includes itself (${[...state.stack, key].join(' > ')}). Skipping the repeated inclusion.`);
        continue;
      }

      const expanded = state.completed.get(key);
      if (expanded) {
        TemplateExpander.addOrigin(expanded, key, templateChain);
        continue;
      }

      state.stack.push(key);
      const children = await this.flatten(await this.loadDeclarations(declaration, state), templateChain, state);
      state.stack.pop();

      state.completed.set(key, children);
      result.push(...children);
    }

    return result;
  }

  private async loadDeclarations(template: TemplateConfig, state: ExpansionState): Promise<Array<ResourceConfig | TemplateConfig>> {
    const file = await this.loader.load(template);
    const blocks: ConfigBlock[] = CodifyParser.parseFile(file, state.sourceMaps);

    const projectConfig = blocks.find((b) => b.configClass === ConfigType.PROJECT) as ProjectConfig | undefined;
    if (projectConfig?.plugins && Object.keys(projectConfig.plugins).length > 0) {
      throw new TemplateError(template.source, `Templates can't declare plugins. Found: ${Object.keys(projectConfig.plugins).join(', ')}`);
    }

    // The project block of a template (description, etc.) does not apply to the project including it.
    return blocks.filter((b) => b.configClass !== ConfigType.PROJECT) as Array<ResourceConfig | TemplateConfig>;
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
