import { Condition, LinuxDistro, ResourceJson, ResourceOs, ResourceConfig as SchemaResourceConfig } from '@codifycli/schemas';

import { deepEqual } from '../utils/index.js';
import { ConfigBlock, ConfigType } from './config.js';
import { ResourceInfo } from './resource-info.js';

/** Resource JSON supported format
 * {
 *   "type": "plugin_name_resource_1",
 *   "name?": "optional-name"
 *   "parameter1": {
 *     "plguin1": "^10.6.2", // From registry
 *     "https://www.github.com/project": "^10.3.2", // url
 *   }
 *   "parameter2": "string",
 *   "parameter3": 1,
 * }
 *
 * We won't be able to validate the parameters until we get the resource definitions from the plugins
 */

const REFERENCE_REGEX = /\${(?<reference>[\w.]+)}/g

/** A template declaration that a resource was included through. */
export interface TemplateRef {
  // Id of the template declaration (template or template.<name>)
  id: string;
  name?: string;
  // What the template was loaded from (registry name, @profile/name or document id)
  source: string;
  // source + version. Identifies the template contents
  sourceKey: string;
  // Constraints declared on the template declaration. They apply to every resource inside the template.
  dependsOn: string[];
  os?: ResourceOs[];
  distro?: LinuxDistro[];
}

/**
 * How a resource ended up in the project. `templates` lists the template declarations it was included through, from
 * the outermost to the innermost. An empty list means the resource is declared directly in the project file.
 */
export interface ResourceOrigin {
  templates: TemplateRef[];
}

export class ResourceConfig implements ConfigBlock {
  readonly configClass = ConfigType.RESOURCE;

  raw: SchemaResourceConfig;
  type: string;
  name?: string;
  dependsOn: string[];
  os?: ResourceOs[];
  distro?: LinuxDistro[];
  // Only include the resource if the condition matches. Evaluated by the VariableResolver, never sent to plugins.
  when?: Condition;
  sourceMapKey?: string;
  // Top level parameters whose value comes from a sensitive variable. Shown as [Sensitive] in the plan.
  sensitiveParameterKeys = new Set<string>();

  // Calculated
  dependencyIds: string[] = []; // id of other nodes
  parameters: Record<string, unknown>;

  resourceInfo?: ResourceInfo;

  // Where the resource was declared. A resource can have multiple origins when duplicates are merged or a template is
  // included more than once. Defaults to the project file.
  origins: ResourceOrigin[] = [{ templates: [] }];
  // dependsOn entries inherited from template declarations (and from merged duplicates). Kept separate from dependsOn
  // so they are never written back to config files or sent to plugins.
  inheritedDependsOn: string[] = [];

  constructor(config: SchemaResourceConfig, sourceMapKey?: string) {
    const { dependsOn, name, type, os, distro, when, ...parameters } = config;

    this.raw = config;
    this.type = type;
    this.name = name;
    this.os = os;
    this.distro = distro;
    this.when = when;
    this.parameters = parameters ?? {};
    this.dependsOn = dependsOn ?? []
    this.sourceMapKey = sourceMapKey;
  }

  static fromJson(json: ResourceJson): ResourceConfig {
    return new ResourceConfig({
      ...json.core,
      ...json.parameters,
    })
  }

  get id() {
    return this.name ? `${this.type}.${this.name}` : this.type;
  }

  /** True if the resource was only included through templates (the user did not declare it themselves). */
  get isFromTemplatesOnly(): boolean {
    return this.origins.every((o) => o.templates.length > 0);
  }

  /** True if any origin of the resource is a template. */
  get isFromTemplate(): boolean {
    return this.origins.some((o) => o.templates.length > 0);
  }

  core(excludeName?: boolean): SchemaResourceConfig {
    return {
      type: this.type,
      ...(excludeName || !this.name ? {} : { name: this.name }),
      ...(this.dependsOn.length > 0 ? { dependsOn: this.dependsOn } : {}),
      ...(this.os && this.os?.length > 0 ? { os: this.os } : {}),
      ...(this.distro && this.distro?.length > 0 ? { distro: this.distro } : {})
    };
  }

  toJson(): ResourceJson {
    return {
      core: this.core(),
      parameters: this.parameters ?? {},
    }
  }

  isSame(type: string, name?: string): boolean {
    const externalId = name ? `${type}.${name}` : type;
    return externalId === this.id;
  }

  isDeepEqual(other?: ResourceConfig | null): boolean {
    if (!other) {
      return false;
    }

    return deepEqual(other.parameters, this.parameters)
      && deepEqual({ type: this.type, name: this.name }, { type: other.type, name: other.name });
  }

  setName(name: string) {
    this.name = name;
    this.raw.name = name;
  }

  setParameter(name: string, value: unknown) {
    this.parameters[name] = value;
    this.raw[name] = value;
  }

  /**
   * @param getMatchingResourceIds returns the ids a reference resolves to. An empty array means the reference is valid
   * but there is nothing to depend on (e.g. a template whose resources were all filtered out), null means the reference
   * doesn't exist.
   */
  addDependenciesFromDependsOn(getMatchingResourceIds: (idOrType: string) => null | string[]) {
    for (const idOrType of this.dependsOn) {
      const matchingIds = getMatchingResourceIds(idOrType);

      if (!matchingIds) {
        throw new Error(`Reference ${idOrType} is not a valid resource`);
      }

      this.dependencyIds.push(...matchingIds);
    }

    // Inherited from a template declaration. A template's dependsOn can match resources of the template itself
    // (e.g. a template that installs homebrew and declares dependsOn: ["homebrew"]), skip those self references.
    for (const idOrType of this.inheritedDependsOn) {
      const matchingIds = getMatchingResourceIds(idOrType);

      if (!matchingIds) {
        throw new Error(`Reference ${idOrType} (declared on a template) is not a valid resource`);
      }

      this.dependencyIds.push(...matchingIds.filter((id) => id !== this.id));
    }
  }

  addDependenciesBasedOnParameters(resourceExists: (id: string) => boolean) {
    // TODO: Only string dependencies are supported currently
    const parametersWithDependencies = Object.entries(this.parameters)
      .filter(([, v]) => typeof v === 'string')
      .filter(([, v]) => REFERENCE_REGEX.test(v as string));

    for (const [, value] of parametersWithDependencies) {
      const matchResult = [...(value as string).matchAll(REFERENCE_REGEX)];

      if (!matchResult) {
        throw new Error('Internal Error: expect dependency match result to not be null');
      }

      const ids = matchResult.map(([, capturedStr]) => capturedStr)

      // Validate that each id exists
      for (const id of ids) {
        if (!resourceExists(id)) {
          throw new Error(`Reference ${id} is not a valid resource`)
        }
      }

      this.dependencyIds.push(...ids);
    }
  }

  addDependencies(dependencies: string[]) {
    this.dependencyIds.push(...dependencies);
  }

  attachResourceInfo(resourceInfo: ResourceInfo) {
    if (resourceInfo.type !== this.type) {
      throw new Error(`Attempting to attach resource info (${resourceInfo.type}) on an un-related resource (${this.type})`)
    }

    this.resourceInfo = resourceInfo;
  }
}
