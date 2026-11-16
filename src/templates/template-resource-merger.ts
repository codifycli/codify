import { Project } from '../entities/project.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ctx } from '../events/context.js';
import { PluginManager, ResourceDefinitionMap } from '../plugins/plugin-manager.js';
import { deepEqual } from '../utils/index.js';
import { TemplateExpander } from './template-expander.js';

const CANDIDATE_NAME_PREFIX = 'codify_merge_candidate_';

export interface MergeWarning {
  resourceId: string;
  parameter: string;
  keptValue: unknown;
  droppedValue: unknown;
}

/**
 * Merges resources from templates with matching resources from the project file or from other templates.
 *
 * Two resources are the same resource if the plugin that owns the type says so (the `match` call). For plugin-core
 * based plugins this means:
 *   - allowMultiple is false: every resource of the same type matches.
 *   - allowMultiple is true: the identifying parameters (or a custom matcher) are equal. Parameters missing on both
 *     resources count as equal.
 *
 * Priority: resources from the project file win over resources from templates, earlier declared templates win over
 * later ones. The merged resource stays at the position of the winning resource.
 *   - arrays are combined (duplicates removed)
 *   - objects are merged key by key
 *   - for other values the winning resource's value is kept and a warning is returned
 *
 * Template resources that don't match anything stay separate. Unnamed duplicates are given unique names afterwards
 * (Project.assignUniqueNamesForDuplicateResources) in declaration order.
 */
export const TemplateResourceMerger = {
  async merge(project: Project, pluginManager: PluginManager, resourceDefinitions: ResourceDefinitionMap): Promise<MergeWarning[]> {
    if (!project.resourceConfigs.some((r) => r.isFromTemplate)) {
      return [];
    }

    // The merge asks the plugins, so every type must exist first
    project.validateTypeIds(resourceDefinitions);

    const warnings: MergeWarning[] = [];
    // Snapshot before merging: a project resource that absorbs a template resource gains a template origin
    const projectResources = project.resourceConfigs.filter((r) => !r.isFromTemplate);
    const templateResources = project.resourceConfigs.filter((r) => r.isFromTemplate);
    const keptTemplateResources: ResourceConfig[] = [];
    const mergedAway = new Set<ResourceConfig>();

    for (const resource of templateResources) {

      // Project file resources first so that they win
      const candidates = [...projectResources, ...keptTemplateResources].filter((c) => c.type === resource.type);
      const match = candidates.length > 0
        ? await TemplateResourceMerger.findMatch(resource, candidates, pluginManager)
        : null;

      if (!match) {
        keptTemplateResources.push(resource);
        continue;
      }

      warnings.push(...TemplateResourceMerger.mergeInto(match, resource));
      mergedAway.add(resource);
      ctx.debug(`Merged ${resource.id} ${TemplateExpander.describeOrigins(resource)} into ${match.id}`);
    }

    project.setExpandedResources(project.resourceConfigs.filter((r) => !mergedAway.has(r)));
    project.assignUniqueNamesForDuplicateResources();

    return warnings;
  },

  async findMatch(resource: ResourceConfig, candidates: ResourceConfig[], pluginManager: PluginManager): Promise<ResourceConfig | null> {
    // Names are not sent: whether two resources are the same is decided by their parameters. Candidates get temporary
    // names so the match can be mapped back.
    const desired = new ResourceConfig({ ...resource.core(true), ...resource.parameters });
    const array = candidates.map((c, idx) => new ResourceConfig({
      ...c.core(true),
      ...c.parameters,
      name: `${CANDIDATE_NAME_PREFIX}${idx}`,
    }));

    const match = await pluginManager.match(desired, array);
    if (!match?.name?.startsWith(CANDIDATE_NAME_PREFIX)) {
      return null;
    }

    return candidates[Number.parseInt(match.name.slice(CANDIDATE_NAME_PREFIX.length), 10)] ?? null;
  },

  /** Merges `loser` into `winner` (in place). Returns warnings for values that could not be merged. */
  mergeInto(winner: ResourceConfig, loser: ResourceConfig): MergeWarning[] {
    const warnings: MergeWarning[] = [];

    for (const [key, value] of Object.entries(loser.parameters)) {
      const merged = mergeValue(winner.parameters[key], value, (keptValue, droppedValue, path) =>
        warnings.push({ resourceId: winner.id, parameter: [key, ...path].join('.'), keptValue, droppedValue })
      );

      if (merged !== winner.parameters[key]) {
        winner.setParameter(key, merged);
      }
    }

    winner.origins.push(...loser.origins);
    winner.inheritedDependsOn = [...new Set([
      ...winner.inheritedDependsOn,
      ...loser.inheritedDependsOn,
      // The dependsOn declared on the template resource itself still applies to the merged resource
      ...loser.dependsOn.filter((d) => !winner.dependsOn.includes(d)),
    ])];

    return warnings;
  },
}

function mergeValue(
  kept: unknown,
  incoming: unknown,
  onConflict: (kept: unknown, dropped: unknown, path: string[]) => void,
  path: string[] = [],
): unknown {
  if (kept === undefined) {
    return incoming;
  }

  if (incoming === undefined || deepEqual(kept, incoming)) {
    return kept;
  }

  if (Array.isArray(kept) && Array.isArray(incoming)) {
    return [...kept, ...incoming.filter((i) => !kept.some((k) => deepEqual(k, i)))];
  }

  if (isPlainObject(kept) && isPlainObject(incoming)) {
    const result: Record<string, unknown> = { ...kept };
    for (const [key, value] of Object.entries(incoming)) {
      result[key] = mergeValue(kept[key], value, onConflict, [...path, key]);
    }

    return result;
  }

  onConflict(kept, incoming, path);
  return kept;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
